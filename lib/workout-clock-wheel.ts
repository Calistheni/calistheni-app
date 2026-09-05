export const WORKOUT_CLOCK_WHEEL_ROW_HEIGHT = 44;

export function clampWorkoutClockWheelIndex(index: number, maximum: number) {
  return Math.min(maximum, Math.max(0, Math.round(index)));
}

export function getWorkoutClockWheelIndex(scrollTop: number, maximum: number, rowHeight = WORKOUT_CLOCK_WHEEL_ROW_HEIGHT) {
  if (!Number.isFinite(scrollTop) || rowHeight <= 0) return 0;
  return clampWorkoutClockWheelIndex(scrollTop / rowHeight, maximum);
}

export function shouldEmitWorkoutClockSelectionHaptic(previousIndex: number, nextIndex: number, userInitiated: boolean) {
  return userInitiated && previousIndex !== nextIndex;
}

export function getWorkoutTimerDurationSeconds(hours: number, minutes: number, seconds: number) {
  const safeHours = clampWorkoutClockWheelIndex(hours, 23);
  const safeMinutes = clampWorkoutClockWheelIndex(minutes, 59);
  const safeSeconds = clampWorkoutClockWheelIndex(seconds, 59);
  return safeHours * 3600 + safeMinutes * 60 + safeSeconds;
}
