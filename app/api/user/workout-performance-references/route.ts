import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ExercisePerformanceReferenceMap, WorkoutPerformanceMetric } from "@/lib/workout-performance-references";

export const runtime = "nodejs";
const metrics: WorkoutPerformanceMetric[] = ["reps", "weight", "durationSeconds", "distanceMeters", "steps", "floors"];

function valid(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { exerciseIds?: unknown; excludeWorkoutId?: unknown; before?: unknown } | null;
  const exerciseIds = Array.isArray(body?.exerciseIds)
    ? [...new Set(body.exerciseIds.filter((id): id is string => typeof id === "string"))].slice(0, 100)
    : [];
  if (!exerciseIds.length) return NextResponse.json({ references: {} });
  const before = typeof body?.before === "string" && !Number.isNaN(new Date(body.before).getTime()) ? new Date(body.before) : undefined;
  const workouts = await prisma.workout.findMany({
    where: { userId: session.user.id, completedAt: { not: null, ...(before ? { lt: before } : {}) }, ...(typeof body?.excludeWorkoutId === "number" ? { id: { not: body.excludeWorkoutId } } : {}) },
    orderBy: { completedAt: "desc" },
    select: { id: true, exercises: { where: { exerciseId: { in: exerciseIds } }, select: { exerciseId: true, sets: { where: { completed: true }, orderBy: { order: "asc" }, select: { reps: true, weight: true, durationSeconds: true, distanceMeters: true, steps: true, floors: true } } } } },
  });
  const references: ExercisePerformanceReferenceMap = Object.fromEntries(exerciseIds.map((id) => [id, { personalBest: {}, previousWorkout: null }]));
  for (const exerciseId of exerciseIds) {
    const matching = workouts.map((workout) => ({ id: workout.id, sets: workout.exercises.filter((exercise) => exercise.exerciseId === exerciseId).flatMap((exercise) => exercise.sets) })).filter((workout) => workout.sets.length);
    const reference = references[exerciseId];
    for (const metric of metrics) {
      const values = matching.flatMap((workout) => workout.sets.map((set) => set[metric]));
      const best = values.filter(valid).reduce<number | undefined>((max, value) => max === undefined || value > max ? value : max, undefined);
      if (best !== undefined) reference.personalBest[metric] = best;
    }
    const previous = matching[0];
    if (previous) {
      const fallbackBest: Record<string, number> = {};
      for (const metric of metrics) {
        const best = previous.sets.map((set) => set[metric]).filter(valid).reduce<number | undefined>((max, value) => max === undefined || value > max ? value : max, undefined);
        if (best !== undefined) fallbackBest[metric] = best;
      }
      reference.previousWorkout = { sets: previous.sets.map((set) => Object.fromEntries(metrics.flatMap((metric) => valid(set[metric]) ? [[metric, set[metric] as number]] : []))), fallbackBest };
    }
  }
  return NextResponse.json({ references });
}
