import {
  calculateWorkoutVolumeKg,
  getPersistedVolumeSetCompletion,
} from "@/lib/workout-volume";
import type { ExerciseTrackingType, WorkoutSummary } from "@/types/workout";

export function mapWorkoutSummary(workout: {
  id: number;
  title: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  visibility: "PRIVATE" | "PUBLIC";
  user?: {
    id: string;
    name: string | null;
    image: string | null;
    bodyweightKg?: number | null;
  };
  exercises: Array<{
    exercise: {
      trackingType: ExerciseTrackingType;
      bodyweightLoadFactor: number | null;
    };
    sets: Array<{
      reps: number | null;
      weight: number | null;
      durationSeconds?: number | null;
      completed?: boolean;
    }>;
  }>;
}): WorkoutSummary {
  const setCount = workout.exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0
  );
  const totalVolume = calculateWorkoutVolumeKg({
    exercises: workout.exercises.map((workoutExercise) => ({
      trackingType: workoutExercise.exercise.trackingType,
      bodyweightLoadFactor: workoutExercise.exercise.bodyweightLoadFactor,
      sets: workoutExercise.sets.map((set) => ({
        reps: set.reps,
        weightKg: set.weight,
        completed: getPersistedVolumeSetCompletion({
          completed: set.completed ?? false,
          workoutUpdatedAt: workout.updatedAt,
        }),
      })),
    })),
    userBodyweightKg: workout.user?.bodyweightKg ?? null,
  });

  return {
    id: workout.id,
    title: workout.title,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    exerciseCount: workout.exercises.length,
    setCount,
    totalVolume,
    visibility: workout.visibility,
    user: workout.user
      ? {
          id: workout.user.id,
          name: workout.user.name,
          image: workout.user.image,
        }
      : undefined,
  };
}
