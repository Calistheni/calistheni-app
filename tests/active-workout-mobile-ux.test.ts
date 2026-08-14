import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builder = new URL("../components/workouts/WorkoutBuilder.tsx", import.meta.url);
const header = new URL("../components/workouts/MobileActiveWorkoutHeader.tsx", import.meta.url);
const globals = new URL("../app/globals.css", import.meta.url);

test("DONE records actual elapsed duration only for the timer attached to that set", async () => {
  const source = await readFile(builder, "utf8");
  assert.match(source, /exerciseTimer\?\.setLocalId === setLocalId/);
  assert.match(source, /getExerciseTimerResultSeconds\([\s\S]*Date\.now\(\)/);
  assert.match(source, /durationSeconds: performedDurationSeconds, completed: true/);
  assert.match(source, /setExerciseTimer\(null\)/);
  assert.doesNotMatch(source, /durationSeconds: activeTimerForSet\.targetSeconds/);
});

test("mobile workout inputs retain a 16px effective font size", async () => {
  const source = await readFile(builder, "utf8");
  assert.match(source, /text-base font-semibold tabular-nums md:text-sm/);
});

test("mobile header uses icon-only sound control and balanced primary actions", async () => {
  const source = await readFile(header, "utf8");
  assert.match(source, /Volume2, VolumeX/);
  assert.match(source, /Mute rest timer sound/);
  assert.match(source, /Enable rest timer sound/);
  assert.doesNotMatch(source, /Rest: \{restMuted/);
  assert.match(source, /grid-cols-\[2\.25rem_2\.25rem_minmax\(0,1fr\)_4rem\]/);
});

test("focused active workout owns one dark, safe-area-aware scroll region", async () => {
  const source = await readFile(globals, "utf8");
  assert.match(source, /\.app-shell-content-focused-workout \{[\s\S]*overflow-y: auto;[\s\S]*background: var\(--background\)/);
  assert.match(source, /overscroll-behavior-y: none/);
  assert.match(source, /flex: 1;[\s\S]*overflow-y: auto;/);
});
