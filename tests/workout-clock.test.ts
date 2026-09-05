import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addWorkoutCountdownTime,
  formatWorkoutCountdown,
  formatWorkoutStopwatch,
  getWorkoutCountdownRemainingMs,
  getWorkoutStopwatchElapsedMs,
  INITIAL_WORKOUT_STOPWATCH,
  initialWorkoutCountdown,
  pauseWorkoutCountdown,
  pauseWorkoutStopwatch,
  resetWorkoutCountdown,
  resumeWorkoutCountdown,
  resumeWorkoutStopwatch,
  startWorkoutCountdown,
  startWorkoutStopwatch,
} from "@/lib/workout-clock";
import { workoutClockNotificationId } from "@/lib/native/workout-clock-notifications";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("stopwatch derives elapsed time from timestamps across pause and resume", () => {
  const started = startWorkoutStopwatch(1_000);
  assert.equal(getWorkoutStopwatchElapsedMs(started, 3_500), 2_500);

  const paused = pauseWorkoutStopwatch(started, 3_500);
  assert.equal(getWorkoutStopwatchElapsedMs(paused, 30_000), 2_500);

  const resumed = resumeWorkoutStopwatch(paused, 30_000);
  assert.equal(getWorkoutStopwatchElapsedMs(resumed, 32_250), 4_750);
  assert.equal(getWorkoutStopwatchElapsedMs(INITIAL_WORKOUT_STOPWATCH, 99_000), 0);
  assert.equal(formatWorkoutStopwatch(267_310), "04:27.31");
});

test("countdown uses its absolute end timestamp across an interval-free time gap", () => {
  const started = startWorkoutCountdown(120, 1_000, "timer-1");
  assert.equal(getWorkoutCountdownRemainingMs(started, 46_000), 75_000);

  const paused = pauseWorkoutCountdown(started, 46_000);
  assert.equal(getWorkoutCountdownRemainingMs(paused, 90_000), 75_000);

  const resumed = resumeWorkoutCountdown(paused, 90_000);
  assert.equal(getWorkoutCountdownRemainingMs(resumed, 100_000), 65_000);

  const extended = addWorkoutCountdownTime(resumed, 30, 100_000);
  assert.equal(getWorkoutCountdownRemainingMs(extended, 100_000), 95_000);
  assert.equal(resetWorkoutCountdown(extended).remainingMs, 120_000);
  assert.equal(formatWorkoutCountdown(155_000), "02:35");
  assert.deepEqual(initialWorkoutCountdown(30), {
    status: "idle",
    runId: null,
    durationMs: 30_000,
    endsAtMs: null,
    remainingMs: 30_000,
  });
});

test("clock UI persists state outside the Drawer content and keeps ticking isolated", () => {
  const clock = read("components/workouts/WorkoutClockTool.tsx");
  assert.match(clock, /const \[stopwatch, setStopwatch\] = useState/);
  assert.match(clock, /const \[countdown, setCountdown\] = useState/);
  assert.match(clock, /const shouldTickStopwatch = open && stopwatch\.status === "running"/);
  assert.match(clock, /const shouldTickCountdown = countdown\.status === "running"/);
  assert.match(clock, /<Drawer open=\{open\} onOpenChange=\{setOpen\}>/);
  assert.match(clock, /<TabsTrigger value="stopwatch">Stopwatch<\/TabsTrigger>/);
  assert.match(clock, /<TabsTrigger value="timer">Timer<\/TabsTrigger>/);
  for (const label of ["Start stopwatch", "Pause stopwatch", "Resume stopwatch", "Reset stopwatch", "Start timer", "Pause timer", "Resume timer", "Reset timer"]) {
    assert.match(clock, new RegExp(`aria-label="${label}"`));
  }
  assert.match(clock, /aria-live="polite"/);
  assert.match(clock, /return \(\) => \{[\s\S]*cancelWorkoutClockNotification\(runId\)/);
});

test("header places the clock after sound without changing the rest timer", () => {
  const header = read("components/workouts/MobileActiveWorkoutHeader.tsx");
  const builder = read("components/workouts/WorkoutBuilder.tsx");
  assert.match(header, /Volume2[\s\S]*<WorkoutClockTool[\s\S]*Add Exercise/);
  assert.match(header, /aria-label=\{restMuted \? "Enable rest timer sound" : "Mute rest timer sound"\}/);
  assert.match(builder, /onInitializeAudio=\{restTimer\.initializeAudio\}/);
  assert.match(builder, /onPlayTimerCompletionSound=\{restTimer\.testSound\}/);
  assert.match(builder, /onAddRestSeconds=\{addRestSeconds\}/);
  assert.match(builder, /onResetRestTimer=\{resetRestTimer\}/);
  assert.match(builder, /onSkipRestTimer=\{skipRestTimer\}/);
});

test("manual timer notifications use an isolated namespace and respect mute", () => {
  const notification = read("lib/native/workout-clock-notifications.ts");
  const id = workoutClockNotificationId("timer-1");
  assert.ok(id >= 1_100_000_000 && id < 1_200_000_000);
  assert.match(notification, /type: "workout-clock"/);
  assert.match(notification, /soundEnabled \? SOUND_CHANNEL_ID : SILENT_CHANNEL_ID/);
  assert.match(notification, /\.\.\.\(soundEnabled \? \{ sound: "default" \} : \{\}\)/);
  assert.match(notification, /allowWhileIdle: true/);
});
