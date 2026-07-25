import type { ExerciseTrackingType } from "@/types/workout";

export type ExerciseTrackingFieldConfig = {
  reps: boolean;
  weight: boolean;
  duration: boolean;
  distance: boolean;
  steps: boolean;
  floors: boolean;
  weightLabel: "Added weight" | "Weight";
};

export function getTrackingTypeFieldConfig(
  trackingType: ExerciseTrackingType
): ExerciseTrackingFieldConfig {
  return {
    reps:
      trackingType === "NOT_SELECTED" ||
      trackingType === "BODYWEIGHT_REPS" ||
      trackingType === "WEIGHTED_BODYWEIGHT" ||
      trackingType === "EXTERNAL_WEIGHT",
    weight:
      trackingType === "NOT_SELECTED" ||
      trackingType === "WEIGHTED_BODYWEIGHT" ||
      trackingType === "EXTERNAL_WEIGHT" ||
      trackingType === "WEIGHT_DISTANCE_DURATION",
    duration:
      trackingType === "NOT_SELECTED" ||
      trackingType === "DURATION" ||
      trackingType === "DISTANCE_DURATION" ||
      trackingType === "STEPS_DISTANCE_DURATION" ||
      trackingType === "FLOORS_DISTANCE_DURATION" ||
      trackingType === "WEIGHT_DISTANCE_DURATION",
    distance:
      trackingType === "NOT_SELECTED" ||
      trackingType === "DISTANCE_DURATION" ||
      trackingType === "STEPS_DISTANCE_DURATION" ||
      trackingType === "FLOORS_DISTANCE_DURATION" ||
      trackingType === "WEIGHT_DISTANCE_DURATION",
    steps: trackingType === "STEPS_DISTANCE_DURATION",
    floors: trackingType === "FLOORS_DISTANCE_DURATION",
    weightLabel:
      trackingType === "WEIGHTED_BODYWEIGHT" ? "Added weight" : "Weight",
  };
}

export function sanitizeRoutineSetForTrackingType<T extends {
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceMeters: number | null;
  steps: number | null;
  floors: number | null;
}>(set: T, trackingType: ExerciseTrackingType): T {
  const fields = getTrackingTypeFieldConfig(trackingType);

  return {
    ...set,
    reps: fields.reps ? set.reps : null,
    weightKg: fields.weight ? set.weightKg : null,
    durationSec: fields.duration ? set.durationSec : null,
    distanceMeters: fields.distance ? set.distanceMeters : null,
    steps: fields.steps ? set.steps : null,
    floors: fields.floors ? set.floors : null,
  };
}
