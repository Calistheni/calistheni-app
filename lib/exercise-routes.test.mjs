import assert from "node:assert/strict";
import test from "node:test";
import { getExerciseRecordHref } from "./exercise-routes.ts";

test("exercise details use the records route with encoded slugs", () => {
  assert.equal(getExerciseRecordHref("pull-up"), "/profile/records/pull-up");
  assert.equal(
    getExerciseRecordHref("custom pull up"),
    "/profile/records/custom%20pull%20up"
  );
});

test("legacy detail URLs redirect while exercise links target records", async () => {
  const fs = await import("node:fs/promises");
  const files = await Promise.all(
    [
      "../app/exercises/[id]/page.tsx",
      "../app/profile/records/[exerciseId]/page.tsx",
      "../components/exercises/ExerciseGrid.tsx",
      "../components/exercises/ExerciseDetailPreview.tsx",
      "../app/workouts/[id]/page.tsx",
    ].map((file) => fs.readFile(new URL(file, import.meta.url), "utf8"))
  );
  assert.match(files[0], /permanentRedirect\(getExerciseRecordHref\(id\)\)/);
  assert.match(files[1], /secondaryMuscles: true/);
  assert.match(files[1], /videoUrl: true/);
  assert.match(files[1], /Movement Video/);
  assert.match(files[1], /flex justify-center/);
  assert.match(files[1], /preload="auto"/);
  assert.match(
    files[1],
    /block h-auto w-auto max-h-\[28rem\] max-w-full rounded-xl lg:max-h-\[32rem\] lg:max-w-lg/
  );
  assert.doesNotMatch(files[1], /aspect-video/);
  assert.doesNotMatch(files[1], /bg-black/);
  assert.doesNotMatch(files[1], /poster=/);
  for (const source of files.slice(2))
    assert.match(source, /getExerciseRecordHref/);
});
