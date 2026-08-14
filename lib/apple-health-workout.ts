import type { WorkoutMutationPayload } from "@/types/workout";

/** HealthKit receives only actual workout timing and canonical distance, never estimates. */
export function getAppleHealthWorkoutPayload(
  workoutId: number,
  workout: Pick<WorkoutMutationPayload, "startedAt" | "completedAt" | "exercises">
) {
  const startedAt = workout.startedAt ?? new Date().toISOString();
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(workout.completedAt ?? startedAt).getTime();
  const distanceMeters = workout.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.completed)
    .reduce((total, set) => total + (set.distanceMeters ?? 0), 0);

  return {
    workoutId: String(workoutId),
    startedAtMs,
    endedAtMs: Math.max(startedAtMs, endedAtMs),
    distanceMeters: distanceMeters > 0 ? distanceMeters : null,
  };
}
