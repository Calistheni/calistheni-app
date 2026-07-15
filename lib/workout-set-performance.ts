import type {
  ExerciseTrackingType,
  WorkoutSetInput,
} from "@/types/workout";

function isMeaningfulPerformanceValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function hasEnteredSetPerformance(
  set: WorkoutSetInput,
  trackingType: ExerciseTrackingType
) {
  switch (trackingType) {
    case "BODYWEIGHT_REPS":
      return isMeaningfulPerformanceValue(set.reps);
    case "WEIGHTED_BODYWEIGHT":
    case "EXTERNAL_WEIGHT":
      return (
        isMeaningfulPerformanceValue(set.reps) ||
        isMeaningfulPerformanceValue(set.weight)
      );
    case "DURATION":
      return isMeaningfulPerformanceValue(set.durationSeconds);
    case "DISTANCE_DURATION":
      return (
        isMeaningfulPerformanceValue(set.distanceMeters) ||
        isMeaningfulPerformanceValue(set.durationSeconds)
      );
    case "STEPS_DISTANCE_DURATION":
      return (
        isMeaningfulPerformanceValue(set.steps) ||
        isMeaningfulPerformanceValue(set.distanceMeters) ||
        isMeaningfulPerformanceValue(set.durationSeconds)
      );
    case "FLOORS_DISTANCE_DURATION":
      return (
        isMeaningfulPerformanceValue(set.floors) ||
        isMeaningfulPerformanceValue(set.distanceMeters) ||
        isMeaningfulPerformanceValue(set.durationSeconds)
      );
    case "WEIGHT_DISTANCE_DURATION":
      return (
        isMeaningfulPerformanceValue(set.weight) ||
        isMeaningfulPerformanceValue(set.distanceMeters) ||
        isMeaningfulPerformanceValue(set.durationSeconds)
      );
    case "NOT_SELECTED":
      return (
        isMeaningfulPerformanceValue(set.reps) ||
        isMeaningfulPerformanceValue(set.weight) ||
        isMeaningfulPerformanceValue(set.durationSeconds) ||
        isMeaningfulPerformanceValue(set.distanceMeters) ||
        isMeaningfulPerformanceValue(set.steps) ||
        isMeaningfulPerformanceValue(set.floors)
      );
  }
}

export function isIncompleteEnteredSet(
  set: WorkoutSetInput,
  trackingType: ExerciseTrackingType
) {
  return !set.completed && hasEnteredSetPerformance(set, trackingType);
}
