import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getWebpDimensions, isWorkoutPhotoKey, WORKOUT_PHOTO_MAX_COUNT, WORKOUT_PHOTO_MAX_EDGE, WORKOUT_PHOTO_WEBP_QUALITY } from "./workout-photo.ts";

test("workout photo storage is user and workout scoped", () => {
  assert.equal(isWorkoutPhotoKey("users/user-1/workouts/42/123e4567-e89b-12d3-a456-426614174000.webp"), true);
  assert.equal(isWorkoutPhotoKey("parks/user-1/photo.webp"), false);
  assert.equal(isWorkoutPhotoKey("users/user-1/workouts/nope/photo.webp"), false);
});

test("workout image compression policy keeps mobile uploads bounded", () => {
  assert.equal(WORKOUT_PHOTO_MAX_COUNT, 10);
  assert.equal(WORKOUT_PHOTO_MAX_EDGE, 2048);
  assert.equal(WORKOUT_PHOTO_WEBP_QUALITY, 0.86);
});

test("WebP VP8X dimensions are derived from validated bytes", () => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0); bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  // 2048 × 1536 stored as zero-based 24-bit little endian values.
  bytes.set([0xff, 0x07, 0, 0xff, 0x05, 0], 24);
  assert.deepEqual(getWebpDimensions(bytes), { width: 2048, height: 1536 });
  assert.equal(getWebpDimensions(new Uint8Array()), null);
});

test("finish sheet exposes the photo step before workout completion", async () => {
  const builder = await readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8");
  assert.match(builder, /Workout photos/);
  assert.match(builder, /finish-workout-photos/);
  assert.match(builder, /browser-image-compression/);
});
