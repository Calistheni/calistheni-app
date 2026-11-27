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
  assert.match(builder, /compressWorkoutPhoto/);
});

test("workout completion refreshes warmed activity and history inside the held detail transition", async () => {
  const builder = await readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8");
  const finish = builder.slice(
    builder.indexOf("function openFinishedWorkout"),
    builder.indexOf("async function uploadFinishPhotosAndOpenWorkout")
  );

  assert.match(finish, /holdWorkoutLoading\(pathname\)/);
  assert.match(finish, /startFinishedWorkoutNavigation\(\(\) => \{\s*router\.push\(pathname\);[\s\S]*?router\.refresh\(\);\s*\}\)/);
  assert.doesNotMatch(finish, /toast\.(success|message)/);
});

test("photo retry and continue use the saved workout without posting another workout", async () => {
  const builder = await readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8");
  const uploader = builder.slice(
    builder.indexOf("async function uploadFinishPhotosAndOpenWorkout"),
    builder.indexOf("async function saveWorkout")
  );
  const save = builder.slice(
    builder.indexOf("async function saveWorkout"),
    builder.indexOf("function addFinishPhotos")
  );

  assert.match(uploader, /finishPhotos\.filter\(\(file\) => !uploadedFinishPhotos\.current\.has\(file\)\)/);
  assert.match(uploader, /if \(!upload\.ok\) throw[\s\S]*?uploadedFinishPhotos\.current\.add\(file\)/);
  assert.match(uploader, /openFinishedWorkout\(workoutId\)/);
  assert.match(save, /if \(savedFinishWorkoutId !== null\) \{[\s\S]*?await uploadFinishPhotosAndOpenWorkout\(savedFinishWorkoutId\);[\s\S]*?return;\s*\}\s*const finalTitle/);
  assert.match(save, /if \(!response\.ok\) \{\s*throw[\s\S]*?setSavedFinishWorkoutId\(workout\.id\);[\s\S]*?await uploadFinishPhotosAndOpenWorkout\(workout\.id\)/);
  assert.match(builder, /onClick=\{\(\) => openFinishedWorkout\(savedFinishWorkoutId\)\}>Continue without photos/);
});
