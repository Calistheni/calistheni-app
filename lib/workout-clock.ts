export type WorkoutStopwatchState = {
  status: "idle" | "running" | "paused";
  startedAtMs: number | null;
  accumulatedMs: number;
};

export type WorkoutCountdownState = {
  status: "idle" | "running" | "paused" | "completed";
  runId: string | null;
  durationMs: number;
  endsAtMs: number | null;
  remainingMs: number;
};

export const INITIAL_WORKOUT_STOPWATCH: WorkoutStopwatchState = {
  status: "idle",
  startedAtMs: null,
  accumulatedMs: 0,
};

export function initialWorkoutCountdown(durationSeconds = 120): WorkoutCountdownState {
  const durationMs = Math.max(0, Math.round(durationSeconds * 1000));
  return { status: "idle", runId: null, durationMs, endsAtMs: null, remainingMs: durationMs };
}

export function getWorkoutStopwatchElapsedMs(stopwatch: WorkoutStopwatchState, nowMs: number) {
  return stopwatch.accumulatedMs + (stopwatch.status === "running" && stopwatch.startedAtMs !== null ? Math.max(0, nowMs - stopwatch.startedAtMs) : 0);
}

export function startWorkoutStopwatch(nowMs: number): WorkoutStopwatchState {
  return { status: "running", startedAtMs: nowMs, accumulatedMs: 0 };
}

export function pauseWorkoutStopwatch(stopwatch: WorkoutStopwatchState, nowMs: number): WorkoutStopwatchState {
  if (stopwatch.status !== "running") return stopwatch;
  return { status: "paused", startedAtMs: null, accumulatedMs: getWorkoutStopwatchElapsedMs(stopwatch, nowMs) };
}

export function resumeWorkoutStopwatch(stopwatch: WorkoutStopwatchState, nowMs: number): WorkoutStopwatchState {
  return stopwatch.status === "paused" ? { ...stopwatch, status: "running", startedAtMs: nowMs } : stopwatch;
}

export function getWorkoutCountdownRemainingMs(countdown: WorkoutCountdownState, nowMs: number) {
  if (countdown.status !== "running" || countdown.endsAtMs === null) return countdown.remainingMs;
  return Math.max(0, countdown.endsAtMs - nowMs);
}

export function startWorkoutCountdown(durationSeconds: number, nowMs: number, runId: string): WorkoutCountdownState {
  const durationMs = Math.max(0, Math.round(durationSeconds * 1000));
  return { status: "running", runId, durationMs, endsAtMs: nowMs + durationMs, remainingMs: durationMs };
}

export function pauseWorkoutCountdown(countdown: WorkoutCountdownState, nowMs: number): WorkoutCountdownState {
  if (countdown.status !== "running") return countdown;
  return { ...countdown, status: "paused", endsAtMs: null, remainingMs: getWorkoutCountdownRemainingMs(countdown, nowMs) };
}

export function resumeWorkoutCountdown(countdown: WorkoutCountdownState, nowMs: number): WorkoutCountdownState {
  if (countdown.status !== "paused" || countdown.remainingMs <= 0) return countdown;
  return { ...countdown, status: "running", endsAtMs: nowMs + countdown.remainingMs };
}

export function addWorkoutCountdownTime(countdown: WorkoutCountdownState, seconds: number, nowMs: number): WorkoutCountdownState {
  const addedMs = Math.max(0, Math.round(seconds * 1000));
  const remainingMs = getWorkoutCountdownRemainingMs(countdown, nowMs) + addedMs;
  return {
    ...countdown,
    status: countdown.status === "completed" ? "paused" : countdown.status,
    endsAtMs: countdown.status === "running" ? nowMs + remainingMs : null,
    durationMs: countdown.durationMs,
    remainingMs,
  };
}

export function completeWorkoutCountdown(countdown: WorkoutCountdownState): WorkoutCountdownState {
  return { ...countdown, status: "completed", endsAtMs: null, remainingMs: 0 };
}

export function resetWorkoutCountdown(countdown: WorkoutCountdownState): WorkoutCountdownState {
  return { ...countdown, status: "idle", runId: null, endsAtMs: null, remainingMs: countdown.durationMs };
}

export function formatWorkoutStopwatch(milliseconds: number) {
  const totalCentiseconds = Math.floor(Math.max(0, milliseconds) / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${time}` : time;
}

export function formatWorkoutCountdown(milliseconds: number) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${time}` : time;
}
