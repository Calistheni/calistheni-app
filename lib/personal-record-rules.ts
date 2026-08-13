import type { ExerciseTrackingType, WorkoutSetInput } from "@/types/workout";

export type PersonalRecordType =
  | "MAX_EXTERNAL_WEIGHT"
  | "MAX_ADDED_WEIGHT"
  | "MAX_REPS"
  | "MAX_SET_VOLUME"
  | "MAX_EXERCISE_VOLUME"
  | "LONGEST_DURATION";

export type PersonalRecordValueMap = Partial<
  Record<PersonalRecordType, number>
>;

export function getSetPersonalRecordValues({
  set,
  trackingType,
}: {
  set: WorkoutSetInput;
  trackingType: ExerciseTrackingType;
}): PersonalRecordValueMap {
  const values: PersonalRecordValueMap = {};
  if (typeof set.reps === "number" && set.reps > 0) values.MAX_REPS = set.reps;
  if (trackingType === "EXTERNAL_WEIGHT" && typeof set.weight === "number" && set.weight > 0) values.MAX_EXTERNAL_WEIGHT = set.weight;
  if (trackingType === "WEIGHTED_BODYWEIGHT" && typeof set.weight === "number" && set.weight > 0) values.MAX_ADDED_WEIGHT = set.weight;
  const durationTracking = trackingType === "DURATION" || trackingType === "DISTANCE_DURATION" || trackingType === "STEPS_DISTANCE_DURATION" || trackingType === "FLOORS_DISTANCE_DURATION" || trackingType === "WEIGHT_DISTANCE_DURATION";
  if (durationTracking && typeof set.durationSeconds === "number" && set.durationSeconds > 0) values.LONGEST_DURATION = set.durationSeconds;
  return values;
}

/**
 * The active-workout PR affordance intentionally checks only the same
 * per-set records persisted by the records service. Workout-volume records
 * cannot be known until the exercise/workout is complete. The marker is live
 * while logging, then the same completed-set rule is persisted on save.
 */
export function isSetPersonalRecordCandidate({
  set,
  trackingType,
  records,
}: {
  set: WorkoutSetInput;
  trackingType: ExerciseTrackingType;
  records: PersonalRecordValueMap;
}) {
  return Object.entries(getSetPersonalRecordValues({ set, trackingType })).some(
    ([type, value]) => records[type as PersonalRecordType] === undefined || value > records[type as PersonalRecordType]!
  );
}
