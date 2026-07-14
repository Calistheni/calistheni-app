export const DEFAULT_WORKOUT_TITLE = "Workout";

export function getFinalWorkoutTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim();

  return trimmedTitle || DEFAULT_WORKOUT_TITLE;
}
