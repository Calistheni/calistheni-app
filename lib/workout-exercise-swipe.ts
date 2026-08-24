export const WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH = 80;
export const WORKOUT_EXERCISE_SWIPE_DIRECTION_THRESHOLD = 10;
export const WORKOUT_EXERCISE_SWIPE_OPEN_THRESHOLD = 32;

export type WorkoutExerciseSwipeDirection = "horizontal" | "vertical" | null;

export function getWorkoutExerciseSwipeDirection(
  deltaX: number,
  deltaY: number
): WorkoutExerciseSwipeDirection {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (
    Math.max(horizontalDistance, verticalDistance) <
    WORKOUT_EXERCISE_SWIPE_DIRECTION_THRESHOLD
  ) {
    return null;
  }

  if (horizontalDistance > verticalDistance * 1.2) return "horizontal";
  if (verticalDistance > horizontalDistance) return "vertical";
  return null;
}

export function getWorkoutExerciseSwipeOffset(
  deltaX: number,
  initiallyOpen: boolean
) {
  const initialOffset = initiallyOpen
    ? -WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH
    : 0;

  return Math.max(
    -WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH,
    Math.min(0, initialOffset + deltaX)
  );
}

export function shouldOpenWorkoutExerciseSwipe(
  deltaX: number,
  initiallyOpen: boolean
) {
  if (deltaX <= -WORKOUT_EXERCISE_SWIPE_OPEN_THRESHOLD) return true;
  if (deltaX >= WORKOUT_EXERCISE_SWIPE_OPEN_THRESHOLD) return false;
  return initiallyOpen;
}
