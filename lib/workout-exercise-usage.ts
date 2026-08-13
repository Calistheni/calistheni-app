import { prisma } from "@/lib/prisma";

export type ExerciseUsage = {
  exerciseId: string;
  workoutCount: number;
  lastUsedAt: string | null;
};

/**
 * Counts an exercise at most once per completed workout. This intentionally
 * avoids making a long workout with many sets outweigh a repeated habit.
 */
export async function getUserExerciseUsage(userId: string): Promise<ExerciseUsage[]> {
  const workouts = await prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, exercises: { select: { exerciseId: true } } },
  });

  const usage = new Map<string, { workoutIds: Set<number>; lastUsedAt: Date }>();
  for (const workout of workouts) {
    for (const exerciseId of new Set(workout.exercises.map((exercise) => exercise.exerciseId))) {
      const current = usage.get(exerciseId);
      if (current) current.workoutIds.add(workout.id);
      else usage.set(exerciseId, { workoutIds: new Set([workout.id]), lastUsedAt: workout.startedAt });
    }
  }

  return [...usage.entries()].map(([exerciseId, value]) => ({
    exerciseId,
    workoutCount: value.workoutIds.size,
    lastUsedAt: value.lastUsedAt.toISOString(),
  }));
}

