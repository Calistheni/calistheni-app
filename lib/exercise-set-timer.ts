export type ExerciseSetTimer = {
  mode: "stopwatch" | "countdown";
  startedAtMs: number | null;
  accumulatedMs: number;
  targetSeconds: number;
  status: "running" | "paused";
};

export function getExerciseTimerElapsedMs(timer: ExerciseSetTimer, nowMs: number) {
  return timer.accumulatedMs + (
    timer.status === "running" && timer.startedAtMs !== null
      ? Math.max(0, nowMs - timer.startedAtMs)
      : 0
  );
}

export function getExerciseTimerDisplaySeconds(timer: ExerciseSetTimer, nowMs: number) {
  const elapsedSeconds = Math.floor(getExerciseTimerElapsedMs(timer, nowMs) / 1000);
  return timer.mode === "countdown"
    ? Math.max(0, timer.targetSeconds - elapsedSeconds)
    : elapsedSeconds;
}

export function getExerciseTimerResultSeconds(timer: ExerciseSetTimer, nowMs: number) {
  return timer.mode === "countdown"
    ? Math.min(timer.targetSeconds, Math.max(0, timer.targetSeconds - getExerciseTimerDisplaySeconds(timer, nowMs)))
    : getExerciseTimerDisplaySeconds(timer, nowMs);
}

export function pauseExerciseSetTimer(timer: ExerciseSetTimer, nowMs: number): ExerciseSetTimer {
  return timer.status === "running"
    ? { ...timer, status: "paused", startedAtMs: null, accumulatedMs: getExerciseTimerElapsedMs(timer, nowMs) }
    : timer;
}

export function resumeExerciseSetTimer(timer: ExerciseSetTimer, nowMs: number): ExerciseSetTimer {
  return timer.status === "paused"
    ? { ...timer, status: "running", startedAtMs: nowMs }
    : timer;
}
