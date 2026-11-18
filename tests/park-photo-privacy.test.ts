import assert from "node:assert/strict";
import sharp from "sharp";
import test from "node:test";
import { sanitizeParkPhotoImage } from "@/lib/park-photo-image";
import { sanitizeWorkoutPhotoImage } from "@/lib/workout-photo-image";

test("public park photo normalization removes source metadata while keeping the image readable", async () => {
  const storage = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../lib/park-photo-storage.ts", import.meta.url), "utf8")
  );
  const source = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "#2463eb" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "private camera owner" } })
    .toBuffer();
  assert.ok((await sharp(source).metadata()).exif);

  const sanitized = await sanitizeParkPhotoImage(source);
  const metadata = await sharp(sanitized).metadata();

  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 3);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.icc, undefined);
  assert.match(storage, /sanitizeParkPhotoImage\(bytes\)/);
  assert.match(storage, /Body: sanitizedBytes/);
  assert.match(storage, /ContentType: "image\/jpeg"/);
});

test("server re-encodes every workout photo, including WebP, without source metadata", async () => {
  const [source, uploadRoute, storage] = await Promise.all([
    sharp({ create: { width: 4, height: 3, channels: 3, background: "#2463eb" } })
      .webp()
      .withExif({ IFD0: { Artist: "private camera owner" } })
      .toBuffer(),
    import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../app/api/user/workouts/[id]/photos/route.ts", import.meta.url), "utf8")
    ),
    import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../lib/workout-photo-storage.ts", import.meta.url), "utf8")
    ),
  ]);
  assert.ok((await sharp(source).metadata()).exif);

  const sanitized = await sanitizeWorkoutPhotoImage(source);
  const metadata = await sharp(sanitized).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 3);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.match(uploadRoute, /sanitizeWorkoutPhotoImage\(sourceBytes\)/);
  assert.match(uploadRoute, /putWorkoutPhoto\(storageKey, bytes\)/);
  assert.match(storage, /Body: bytes/);
});

test("photo verification keeps exact coordinates for authorized review, outside public park serializers", async () => {
  const [verification, publicParks, api] = await Promise.all([
    import("@/lib/photo-location-verification"),
    import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../lib/parks.ts", import.meta.url), "utf8")
    ),
    import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../app/api/parks/[id]/route.ts", import.meta.url), "utf8")
    ),
  ]);
  const stored = verification.normalizePhotoLocationVerifications(
    [{ photoLatitude: 42.6977, photoLongitude: 23.3219 }],
    1,
    42.6978,
    23.322
  );
  assert.equal(stored[0].photoLatitude, 42.6977);
  assert.doesNotMatch(publicParks, /photoLocationVerifications|gpsVerification/);
  assert.doesNotMatch(api, /photoLocationVerifications|gpsVerification/);
});
