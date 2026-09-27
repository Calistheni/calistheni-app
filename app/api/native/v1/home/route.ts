import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/user-auth";
import {
  nativeCorsJson,
  nativeCorsPreflight,
  rejectDisallowedNativeOrigin,
} from "@/lib/native-api-cors";
import {
  calculateCurrentWorkoutStreak,
  getUtcWeekStart,
} from "@/lib/home-dashboard";
import { calculateWeeklyReport } from "@/lib/weekly-report";
import { mapWorkoutSummary } from "@/lib/workouts";
import { getPersistedVolumeSetCompletion } from "@/lib/workout-volume";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return nativeCorsPreflight(request);
}

export async function GET(request: Request) {
  const rejectedOrigin = rejectDisallowedNativeOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return nativeCorsJson(
      request,
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const now = new Date();
  const weekStart = getUtcWeekStart(now);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const [profile, workouts, completedDates, recentWorkout, personalRecords] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, weeklyWorkoutGoal: true },
      }),
      prisma.workout.findMany({
        where: { userId, completedAt: { gte: previousWeekStart } },
        orderBy: { completedAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              bodyweightKg: true,
            },
          },
          exercises: {
            orderBy: { order: "asc" },
            select: {
              exercise: {
                select: {
                  muscle: true,
                  secondaryMuscles: true,
                  trackingType: true,
                  bodyweightLoadFactor: true,
                },
              },
              sets: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  completed: true,
                  reps: true,
                  weight: true,
                },
              },
            },
          },
        },
      }),
      prisma.workout.findMany({
        where: { userId, completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: "asc" },
      }),
      prisma.workout.findFirst({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { id: true, title: true, completedAt: true },
      }),
      prisma.personalRecord.count({
        where: { userId, achievedAt: { gte: weekStart } },
      }),
    ]);

  if (!profile) {
    return nativeCorsJson(
      request,
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const report = calculateWeeklyReport({
    weekStart,
    workouts: workouts.map((workout) => {
      const summary = mapWorkoutSummary(workout);
      return {
        id: workout.id,
        startedAt: workout.startedAt,
        completedAt: workout.completedAt,
        totalVolumeKg: summary.totalVolume,
        sets: workout.exercises.flatMap((workoutExercise) =>
          workoutExercise.sets.map((set) => ({
            id: set.id,
            completed:
              getPersistedVolumeSetCompletion({
                completed: set.completed,
                workoutUpdatedAt: workout.updatedAt,
              }) !== false,
            reps: set.reps,
            primaryMuscle: workoutExercise.exercise.muscle,
            secondaryMuscles: workoutExercise.exercise.secondaryMuscles,
          }))
        ),
      };
    }),
  });

  return nativeCorsJson(
    request,
    {
      greetingName: profile.name?.trim().split(/\s+/)[0] || "athlete",
      asOf: now.toISOString(),
      streakDays: calculateCurrentWorkoutStreak(completedDates, now),
      week: {
        startsAt: weekStart.toISOString(),
        workouts: report.current.workouts,
        completedSets: report.current.completedSets,
        totalVolumeKg: report.current.totalVolumeKg,
        activeDays: report.current.activeDays,
        totalReps: report.current.totalReps,
        durationSeconds: report.current.durationSeconds,
        personalRecords,
        workoutGoal: profile.weeklyWorkoutGoal,
      },
      recentWorkout: recentWorkout
        ? {
            id: recentWorkout.id,
            title: recentWorkout.title || "Workout",
            completedAt: recentWorkout.completedAt?.toISOString() ?? null,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
