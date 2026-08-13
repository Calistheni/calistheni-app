import assert from "node:assert/strict";
import test from "node:test";
import {
  getExerciseTimerDisplaySeconds,
  getExerciseTimerResultSeconds,
  pauseExerciseSetTimer,
  resumeExerciseSetTimer,
  type ExerciseSetTimer,
} from "@/lib/exercise-set-timer";

test("stopwatch measures elapsed time from absolute timestamps across pause and resume", () => {
  const running: ExerciseSetTimer = { mode: "stopwatch", startedAtMs: 0, accumulatedMs: 0, targetSeconds: 0, status: "running" };
  assert.equal(getExerciseTimerDisplaySeconds(running, 65_000), 65);
  const paused = pauseExerciseSetTimer(running, 65_000);
  assert.equal(getExerciseTimerDisplaySeconds(paused, 125_000), 65);
  const resumed = resumeExerciseSetTimer(paused, 125_000);
  assert.equal(getExerciseTimerResultSeconds(resumed, 130_000), 70);
});

test("countdown uses an absolute start time and preserves its remaining duration while paused", () => {
  const running: ExerciseSetTimer = { mode: "countdown", startedAtMs: 0, accumulatedMs: 0, targetSeconds: 900, status: "running" };
  assert.equal(getExerciseTimerDisplaySeconds(running, 300_000), 600);
  const paused = pauseExerciseSetTimer(running, 300_000);
  assert.equal(getExerciseTimerDisplaySeconds(paused, 600_000), 600);
  const resumed = resumeExerciseSetTimer(paused, 600_000);
  assert.equal(getExerciseTimerDisplaySeconds(resumed, 1_200_000), 0);
  assert.equal(getExerciseTimerResultSeconds(resumed, 1_200_000), 900);
});
