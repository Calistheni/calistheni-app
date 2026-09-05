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
  assert.match(source, /grid-cols-\[2\.5rem_2\.5rem_2\.5rem_minmax\(0,1fr\)_3\.75rem\]/);
  assert.match(source, /variant="ghost" className="size-10"/);
  assert.match(source, /variant="outline"[\s\S]*className="h-10 min-w-0/);
});

test("active rest time is the visual focus without changing its actions", async () => {
  const source = await readFile(header, "utf8");
  assert.match(
    source,
    /text-3xl leading-none font-black tracking-tight tabular-nums text-foreground/
  );
  assert.match(source, /grid grid-cols-4 gap-1/);
  assert.match(source, />\s*\+30s\s*</);
  assert.match(source, />\s*\+1m\s*</);
  assert.match(source, />\s*Reset\s*</);
  assert.match(source, />\s*Skip\s*</);
});

test("focused active workout owns one dark, safe-area-aware scroll region", async () => {
  const source = await readFile(globals, "utf8");
  assert.match(source, /\.app-shell-content-focused-workout \{[\s\S]*overflow-y: auto;[\s\S]*background: var\(--background\)/);
  assert.match(source, /overscroll-behavior-y: none/);
  assert.match(source, /flex: 1;[\s\S]*overflow-y: auto;/);
  assert.match(source, /\.app-shell \{[\s\S]*min-height: 100dvh;[\s\S]*background: var\(--background\)/);
});
