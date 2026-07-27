import { calculateWeeklyCardioProgress } from "@/lib/cardio";
import { getUtcWeekStart } from "@/lib/home-dashboard";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

export async function getWeeklyCardioProgress(
  userId: string,
  now = new Date()
) {
  const weekStart = getUtcWeekStart(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const [user, sets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyCardioGoalMinutes: true },
    }),
    prisma.workoutSet.findMany({
      where: {
        completed: true,
        durationSeconds: { gt: 0 },
        workoutExercise: {
          workout: {
            userId,
            completedAt: {
              gte: weekStart,
              lt: weekEnd,
            },
          },
        },
      },
      select: {
        id: true,
        completed: true,
        durationSeconds: true,
        workoutExercise: {
          select: {
            exercise: {
              select: {
                id: true,
                name: true,
                muscle: true,
                trackingType: true,
              },
            },
            workout: {
              select: {
                id: true,
                title: true,
                completedAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        workoutExercise: {
          workout: {
            completedAt: "desc",
          },
        },
      },
    }),
  ]);

  if (!user) {
    throw new Error("CARDIO_PROGRESS_FAILED");
  }

  return calculateWeeklyCardioProgress({
    goalMinutes: user.weeklyCardioGoalMinutes,
    now,
    entries: sets.flatMap((set) => {
      const workout = set.workoutExercise.workout;
      const exercise = set.workoutExercise.exercise;
      return workout.completedAt
        ? [
            {
              setId: set.id,
              workoutId: workout.id,
              workoutTitle: workout.title,
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              muscle: exercise.muscle,
              trackingType: exercise.trackingType,
              completedAt: workout.completedAt,
              durationSeconds: set.durationSeconds,
              completed: set.completed,
            },
          ]
        : [];
    }),
  });
}
