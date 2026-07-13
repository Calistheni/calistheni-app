import type { ExerciseTrackingType } from "@/types/workout";

export const REST_SELECTOR_SECONDS = [0, 30, 60, 90, 120, 180] as const;

const EXERCISE_TRACKING_TYPE_LABELS: Record<ExerciseTrackingType, string> = {
  NOT_SELECTED: "Not selected",
  BODYWEIGHT_REPS: "Bodyweight reps",
  WEIGHTED_BODYWEIGHT: "Weighted bodyweight",
  EXTERNAL_WEIGHT: "External weight",
  DURATION: "Duration",
  DISTANCE_DURATION: "Distance + time",
  STEPS_DISTANCE_DURATION: "Steps + distance + time",
  FLOORS_DISTANCE_DURATION: "Floors + distance + time",
  WEIGHT_DISTANCE_DURATION: "Weight + distance + time",
};

export function getExerciseThumbnailSrc(thumbnailUrl: string | null) {
  return thumbnailUrl ?? "/icons/icon.png";
}

export function getExerciseTrackingTypeLabel(
  trackingType: ExerciseTrackingType
) {
  return EXERCISE_TRACKING_TYPE_LABELS[trackingType];
}

export function formatRestDuration(seconds: number) {
  if (seconds === 0) return "Off";

  return seconds >= 60 && seconds % 60 === 0
    ? `${seconds / 60} min`
    : `${seconds} sec`;
}

export function getRestBadgeLabel(seconds: number) {
  return seconds === 0 ? "Rest off" : `Rest ${formatRestDuration(seconds)}`;
}
