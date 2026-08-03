import "server-only";
import { prisma } from "@/lib/prisma";
import { calculateWorkoutVolumeKg } from "@/lib/workout-volume";
import { aggregateCompletedSetsByMuscle, getMuscleWorkloadSummary } from "@/lib/muscle-activity";
import { isPlanScheduledOn, previousCompletedWeek } from "@/lib/progress";
import type { Prisma } from "@/lib/generated/prisma/client";

type Snapshot = Record<string, unknown>;

export async function generatePreviousWeeklyReport(userId: string, now = new Date()) {
  const { weekStart, weekEnd } = previousCompletedWeek(now);
  const existing = await prisma.weeklyProgressReport.findUnique({ where: { userId_weekStart: { userId, weekStart } } });
  if (existing) return { report: existing, created: false };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { bodyweightKg: true } });
  const workouts = await prisma.workout.findMany({
    where: { userId, completedAt: { gte: weekStart, lt: weekEnd } },
    include: { exercises: { include: { exercise: true, sets: { where: { completed: true } } } } },
    orderBy: { completedAt: "asc" },
  });
  const completedSets = workouts.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ set, exercise }))));
  const repetitions = completedSets.reduce((sum, item) => sum + (item.set.reps ?? 0), 0);
  const durationSeconds = workouts.reduce((sum, workout) => sum + Math.max(0, ((workout.completedAt?.getTime() ?? workout.startedAt.getTime()) - workout.startedAt.getTime()) / 1000), 0);
  const volume = calculateWorkoutVolumeKg({ exercises: workouts.flatMap((workout) => workout.exercises.map((exercise) => ({ trackingType: exercise.exercise.trackingType, bodyweightLoadFactor: exercise.exercise.bodyweightLoadFactor, sets: exercise.sets.map((set) => ({ reps: set.reps, weightKg: set.weight, completed: set.completed })) }))), userBodyweightKg: user.bodyweightKg });
  const exerciseCounts = new Map<string, { name: string; count: number }>();
  for (const item of completedSets) { const value = exerciseCounts.get(item.exercise.exerciseId) ?? { name: item.exercise.exercise.name, count: 0 }; value.count++; exerciseCounts.set(item.exercise.exerciseId, value); }
  const topExercise = [...exerciseCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;
  const muscles = getMuscleWorkloadSummary(aggregateCompletedSetsByMuscle(completedSets.map(({ set, exercise }) => ({ aggregationId: set.id, primaryMuscle: exercise.exercise.muscle, secondaryMuscles: exercise.exercise.secondaryMuscles })))).filter((point) => point.workloadScore > 0);
  const records = await prisma.personalRecord.count({ where: { userId, achievedAt: { gte: weekStart, lt: weekEnd } } });
  const plans = await prisma.userSupplementPlan.findMany({ where: { userId, createdAt: { lt: weekEnd }, OR: [{ archivedAt: null }, { archivedAt: { gte: weekStart } }] }, include: { supplementDefinition: true, logs: { where: { scheduledFor: { gte: weekStart, lt: weekEnd } } } } });
  const scheduled = plans.flatMap((plan) => Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setUTCDate(date.getUTCDate() + index); return isPlanScheduledOn(plan, date) ? { plan, date } : null; }).filter(Boolean) as Array<{ plan: typeof plan; date: Date }>);
  const completedDoses = scheduled.filter(({ plan, date }) => plan.logs.some((log) => log.scheduledFor.getTime() === date.getTime())).length;
  const measurementEntries = await prisma.bodyMeasurementEntry.findMany({ where: { userId, measuredAt: { lt: weekEnd } }, orderBy: { measuredAt: "desc" }, take: 2 });
  const latest = measurementEntries[0]; const previous = measurementEntries[1];
  const measurementChanges = latest && previous ? Object.fromEntries(["bodyweightKg", "waistCm", "chestCm", "hipsCm"].flatMap((key) => { const a = latest[key as keyof typeof latest] as { toNumber: () => number } | null; const b = previous[key as keyof typeof previous] as { toNumber: () => number } | null; return a && b ? [[key, a.toNumber() - b.toNumber()]] : []; })) : {};
  const snapshot: Snapshot = { workoutsCompleted: workouts.length, activeTrainingDays: new Set(workouts.map((workout) => workout.completedAt!.toISOString().slice(0, 10))).size, completedSets: completedSets.length, repetitions, durationSeconds: Math.round(durationSeconds), volumeKg: volume, exercisesPerformed: exerciseCounts.size, routinesUsed: new Set(workouts.map((workout) => workout.title).filter(Boolean)).size, personalRecords: records, topExercise, muscleGroups: muscles, longestWorkoutSeconds: workouts.length ? Math.round(Math.max(...workouts.map((workout) => ((workout.completedAt?.getTime() ?? workout.startedAt.getTime()) - workout.startedAt.getTime()) / 1000))) : null, averageWorkoutDurationSeconds: workouts.length ? Math.round(durationSeconds / workouts.length) : null, supplement: scheduled.length ? { scheduledDoses: scheduled.length, completedDoses, adherencePercent: Math.round(completedDoses / scheduled.length * 100) } : null, measurementChanges };
  const summary = workouts.length ? `You completed ${workouts.length} workout${workouts.length === 1 ? "" : "s"} across ${(snapshot.activeTrainingDays as number)} active day${snapshot.activeTrainingDays === 1 ? "" : "s"}, finishing ${completedSets.length} sets${records ? ` and setting ${records} personal record${records === 1 ? "" : "s"}` : ""}.${muscles[0] ? ` ${muscles[0].muscle} was your most-trained muscle group.` : ""}${topExercise ? ` ${topExercise.name} was your most-performed exercise.` : ""}` : "No completed workouts were recorded this week. Progress can look different from week to week.";
  try { const report = await prisma.weeklyProgressReport.create({ data: { userId, weekStart, weekEnd, summary, snapshot: snapshot as Prisma.InputJsonValue } }); return { report, created: true }; }
  catch (error: unknown) { const report = await prisma.weeklyProgressReport.findUnique({ where: { userId_weekStart: { userId, weekStart } } }); if (report) return { report, created: false }; throw error; }
}
