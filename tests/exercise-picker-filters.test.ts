import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("exercise picker uses canonical muscles and tracking types, and has a CTA in both layouts", async () => {
  const [picker, select] = await Promise.all([
    readFile(new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(picker, /secondaryMuscles\.includes\(muscleFilter\)/);
  assert.match(picker, /trackingTypeFilter === "all" \|\| exercise\.trackingType === trackingTypeFilter/);
  assert.match(picker, /trackingTypes\.map/);
  assert.doesNotMatch(picker, /All Equipment|equipmentFilter/);
  assert.match(picker, /flex flex-wrap items-center gap-2/);
  assert.match(picker, /container=\{exercisePickerContentRef\.current\}/);
  assert.match(picker, /exercise\.muscle\} · \{formatTrackingType\(exercise\.trackingType\)/);
  assert.match(picker, /No exercises match these filters\./);
  assert.match(picker, /Clear filters/);
  assert.match(picker, /keyboardSafe \? "pb-/);
  assert.match(select, /z-\[80\]/);
});
