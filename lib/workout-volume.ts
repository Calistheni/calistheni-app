import type { ExerciseTrackingType } from "@/types/workout";

export type WorkoutVolumeSetInput = {
  reps: number | null;
  weightKg: number | null;
  completed?: boolean;
};

export type WorkoutVolumeExerciseInput = {
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  sets: WorkoutVolumeSetInput[];
};

const SET_COMPLETION_TRACKING_ROLLOUT_AT = Date.parse(
  "2026-07-05T15:48:58.000Z"
);

export function isWorkoutVolumeSetIncluded(
  set: Pick<WorkoutVolumeSetInput, "completed">
) {
  return set.completed !== false;
}

export function getPersistedVolumeSetCompletion({
  completed,
  workoutUpdatedAt,
}: {
  completed: boolean;
  workoutUpdatedAt: Date;
}): boolean | undefined {
  // The completion column was introduced with a false default, so untouched
  // workouts from before that rollout have no trustworthy completion state.
  return workoutUpdatedAt.getTime() < SET_COMPLETION_TRACKING_ROLLOUT_AT
    ? undefined
    : completed;
}

export function calculateSetVolumeKg({
  trackingType,
  reps,
  weightKg,
  userBodyweightKg,
  bodyweightLoadFactor,
}: {
  trackingType: ExerciseTrackingType;
  reps: number | null;
  weightKg: number | null;
  userBodyweightKg: number | null;
  bodyweightLoadFactor: number | null;
}) {
  const safeReps = reps ?? 0;

  if (safeReps === 0) {
    return 0;
  }

  switch (trackingType) {
    case "BODYWEIGHT_REPS":
      return userBodyweightKg === null
        ? null
        : userBodyweightKg * (bodyweightLoadFactor ?? 1) * safeReps;
    case "WEIGHTED_BODYWEIGHT":
      return userBodyweightKg === null
        ? null
        : (userBodyweightKg * (bodyweightLoadFactor ?? 1) +
            (weightKg ?? 0)) *
            safeReps;
    case "EXTERNAL_WEIGHT":
      return (weightKg ?? 0) * safeReps;
    case "DURATION":
    case "DISTANCE_DURATION":
    case "STEPS_DISTANCE_DURATION":
    case "FLOORS_DISTANCE_DURATION":
    case "WEIGHT_DISTANCE_DURATION":
      return 0;
    case "NOT_SELECTED":
      return null;
  }
}

export function calculateWorkoutVolumeKg({
  exercises,
  userBodyweightKg,
}: {
  exercises: WorkoutVolumeExerciseInput[];
  userBodyweightKg: number | null;
}) {
  let totalVolumeKg = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!isWorkoutVolumeSetIncluded(set)) {
        continue;
      }

      const setVolumeKg = calculateSetVolumeKg({
        trackingType: exercise.trackingType,
        reps: set.reps,
        weightKg: set.weightKg,
        userBodyweightKg,
        bodyweightLoadFactor: exercise.bodyweightLoadFactor,
      });

      if (setVolumeKg === null) {
        return null;
      }

      totalVolumeKg += setVolumeKg;
    }
  }

  return totalVolumeKg;
}
