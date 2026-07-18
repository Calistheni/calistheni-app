import assert from "node:assert/strict";
import test from "node:test";
import {
  detectParkPhotoFamily,
  PARK_PHOTO_MAX_FILE_SIZE,
  validateParkPhotoBytes,
  validateParkPhotoMetadata,
} from "./park-photo-file.ts";
import {
  getPermanentParkPhotoKey,
  isPendingParkPhotoKeyForUser,
  isPermanentParkPhotoKey,
  isSafeParkPhotoObjectKey,
} from "./park-photo-keys.ts";

test("park photo metadata accepts supported iPhone and web formats", () => {
  for (const [name, type] of [
    ["park.jpg", "image/jpeg"],
    ["park.png", "image/png"],
    ["park.webp", "image/webp"],
    ["park.heic", "image/heic"],
    ["park.heif", "image/heif"],
  ]) {
    assert.equal(
      validateParkPhotoMetadata({ name, type, size: 1024 }).success,
      true
    );
  }
});

test("park photo metadata rejects mismatched, unsupported, and oversized files", () => {
  assert.equal(
    validateParkPhotoMetadata({
      name: "park.jpg",
      type: "image/png",
      size: 1024,
    }).success,
    false
  );
  assert.equal(
    validateParkPhotoMetadata({
      name: "park.svg",
      type: "image/svg+xml",
      size: 1024,
    }).success,
    false
  );
  assert.equal(
    validateParkPhotoMetadata({
      name: "park.jpg",
      type: "image/jpeg",
      size: PARK_PHOTO_MAX_FILE_SIZE + 1,
    }).success,
    false
  );
});

test("park photo content detection validates magic bytes", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const metadata = validateParkPhotoMetadata({
    name: "park.jpg",
    type: "image/jpeg",
    size: jpeg.length,
  });

  assert.equal(detectParkPhotoFamily(jpeg), "jpeg");
  assert.equal(validateParkPhotoBytes(metadata, jpeg).success, true);
  assert.equal(
    validateParkPhotoBytes(metadata, new TextEncoder().encode("not an image"))
      .success,
    false
  );
});

test("pending and permanent park keys remain separate and user scoped", () => {
  const pending = "pending/parks/user-1/123e4567-e89b-12d3-a456-426614174000.jpg";
  const permanent = getPermanentParkPhotoKey(pending);

  assert.equal(isPendingParkPhotoKeyForUser(pending, "user-1"), true);
  assert.equal(isPendingParkPhotoKeyForUser(pending, "user-2"), false);
  assert.equal(permanent, "parks/user-1/123e4567-e89b-12d3-a456-426614174000.jpg");
  assert.equal(isPermanentParkPhotoKey(permanent), true);
  assert.equal(isSafeParkPhotoObjectKey("../../exercise-assets/file.jpg"), false);
  assert.equal(isPermanentParkPhotoKey("exercise-assets/file.jpg"), false);
});
