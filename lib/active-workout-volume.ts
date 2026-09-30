import { calculateWorkoutVolumeKg } from "@/lib/workout-volume";
import type {
  ExerciseListItem,
  ExerciseTrackingType,
  WorkoutSetInput,
} from "@/types/workout";

export type ActiveWorkoutTrackingMetadata = {
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
};

export type ActiveWorkoutVolumeExercise = ActiveWorkoutTrackingMetadata & {
  exerciseId: string;
  sets: Array<
    Pick<WorkoutSetInput, "reps" | "weight" | "completed">
  >;
};

/**
 * Copies calculation-critical metadata from the exact picker/catalog exercise
 * into active-workout state. The state can then be persisted and restored
 * without changing a weighted-bodyweight movement into external-weight-only.
 */
export function attachActiveWorkoutTrackingMetadata<
  T extends { exerciseId: string },
>(exerciseState: T, exercise: ExerciseListItem): T & ActiveWorkoutTrackingMetadata {
  if (exerciseState.exerciseId !== exercise.id) {
    throw new Error("Active workout exercise metadata does not match its exercise ID.");
  }

  return {
    ...exerciseState,
    trackingType: exercise.trackingType,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor,
  };
}

/**
 * Restores metadata from the current canonical catalog. This also upgrades
 * drafts written before tracking metadata became part of active-workout state.
 */
export function restoreActiveWorkoutTrackingMetadata<
  T extends { exerciseId: string },
>(
  exerciseState: T,
  exerciseCatalog: readonly ExerciseListItem[]
): (T & ActiveWorkoutTrackingMetadata) | null {
  const exercise = exerciseCatalog.find(
    (candidate) => candidate.id === exerciseState.exerciseId
  );

  return exercise
    ? attachActiveWorkoutTrackingMetadata(exerciseState, exercise)
    : null;
}

/**
 * This is the live WorkoutBuilder volume path. It deliberately consumes the
 * active-workout object itself rather than rejoining a second metadata source
 * at calculation time.
 */
export function calculateActiveWorkoutVolumeKg({
  exercises,
  userBodyweightKg,
}: {
  exercises: readonly ActiveWorkoutVolumeExercise[];
  userBodyweightKg: number | null;
}) {
  return calculateWorkoutVolumeKg({
    exercises: exercises.map((exercise) => ({
      trackingType: exercise.trackingType,
      bodyweightLoadFactor: exercise.bodyweightLoadFactor,
      sets: exercise.sets.map((set) => ({
        reps: set.reps,
        weightKg: set.weight,
        completed: set.completed,
      })),
    })),
    userBodyweightKg,
  });
}
