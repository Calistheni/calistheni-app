import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getWorkoutClockWheelIndex,
  getWorkoutTimerDurationSeconds,
  shouldEmitWorkoutClockSelectionHaptic,
  WORKOUT_CLOCK_WHEEL_ROW_HEIGHT,
} from "@/lib/workout-clock-wheel";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("wheel scroll position resolves to one centered bounded item", () => {
  assert.equal(getWorkoutClockWheelIndex(0, 59), 0);
  assert.equal(getWorkoutClockWheelIndex(WORKOUT_CLOCK_WHEEL_ROW_HEIGHT * 11, 59), 11);
  assert.equal(getWorkoutClockWheelIndex(WORKOUT_CLOCK_WHEEL_ROW_HEIGHT * 11.49, 59), 11);
  assert.equal(getWorkoutClockWheelIndex(WORKOUT_CLOCK_WHEEL_ROW_HEIGHT * 11.51, 59), 12);
  assert.equal(getWorkoutClockWheelIndex(-100, 23), 0);
  assert.equal(getWorkoutClockWheelIndex(100_000, 23), 23);
});

test("selection haptics fire once per changed centered value, not per scroll event", () => {
  const centeredValues = [10, 10, 11, 11, 12, 12, 13];
  let hapticCount = 0;
  for (let index = 1; index < centeredValues.length; index += 1) {
    if (shouldEmitWorkoutClockSelectionHaptic(centeredValues[index - 1]!, centeredValues[index]!, true)) hapticCount += 1;
  }
  assert.equal(hapticCount, 3);
  assert.equal(shouldEmitWorkoutClockSelectionHaptic(10, 11, false), false, "programmatic initialization must stay silent");
  assert.equal(shouldEmitWorkoutClockSelectionHaptic(10, 10, true), false, "pixel movement inside one row must stay silent");
});

test("hours, minutes, and seconds produce exact bounded durations", () => {
  assert.equal(getWorkoutTimerDurationSeconds(1, 12, 35), 4_355);
  assert.equal(getWorkoutTimerDurationSeconds(0, 0, 1), 1);
  assert.equal(getWorkoutTimerDurationSeconds(0, 59, 59), 3_599);
  assert.equal(getWorkoutTimerDurationSeconds(23, 59, 59), 86_399);
  assert.equal(getWorkoutTimerDurationSeconds(99, 99, 99), 86_399);
});

test("timer setup uses three native scroll-snap wheels and no number inputs", () => {
  const clock = read("components/workouts/WorkoutClockTool.tsx");
  const wheel = read("components/workouts/WorkoutTimeWheel.tsx");

  assert.match(clock, /<WorkoutTimeWheel label="Hours" maximum=\{23\}/);
  assert.match(clock, /<WorkoutTimeWheel label="Minutes" maximum=\{59\}/);
  assert.match(clock, /<WorkoutTimeWheel label="Seconds" maximum=\{59\}/);
  assert.match(clock, /top-1\/2[\s\S]*h-11[\s\S]*bg-muted\/70/);
  assert.doesNotMatch(clock, /type="number"/);
  assert.match(clock, /disabled=\{configuredDurationSeconds <= 0\}/);

  assert.match(wheel, /snap-y snap-mandatory/);
  assert.match(wheel, /snap-center/);
  assert.doesNotMatch(wheel, /snap-always/, "momentum flicks must be able to pass more than one value");
  assert.match(wheel, /overflow-y-auto/);
  assert.match(wheel, /touch-pan-y/);
  assert.match(wheel, /data-vaul-no-drag="true"/);
  assert.match(wheel, /role="spinbutton"/);
  assert.match(wheel, /aria-valuenow=\{centeredValue\}/);
  assert.match(wheel, /distance === 1[\s\S]*opacity-55/);
  assert.match(wheel, /distance > 1[\s\S]*opacity-20/);
});

test("native selection lifecycle is guarded and programmatic positioning emits no haptic", () => {
  const wheel = read("components/workouts/WorkoutTimeWheel.tsx");
  assert.match(wheel, /isNativePluginAvailable\("Haptics"\)/);
  assert.match(wheel, /Haptics\.selectionStart\(\)/);
  assert.match(wheel, /Haptics\.selectionChanged\(\)/);
  assert.match(wheel, /Haptics\.selectionEnd\(\)/);
  assert.match(wheel, /shouldEmitWorkoutClockSelectionHaptic\(previousValue, nextValue, interactionRef\.current\)/);
  assert.match(wheel, /if \(!viewport \|\| interactionRef\.current\) return;/);
  assert.doesNotMatch(wheel, /scrollIntoView/);
});
