import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, parsePositiveInteger } from "@/lib/api-response";
import { getCommunityWorkoutForViewer } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { createUserWorkout, userWorkoutInclude } from "@/lib/workouts";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const sourceId = parsePositiveInteger((await params).id);
  if (sourceId === null) return createJsonErrorResponse("Invalid workout id.", 400);
  try {
    const sourceAccess = await getCommunityWorkoutForViewer(sourceId, userId);
    if (!sourceAccess) return createJsonErrorResponse("Workout not found.", 404);
    const source = await prisma.workout.findUnique({ where: { id: sourceId }, include: userWorkoutInclude });
    if (!source) return createJsonErrorResponse("Workout not found.", 404);
    const localIds = source.exercises.map((_, index) => `copy-exercise-${index}`);
    const supersetKey = new Map(source.supersets.map((superset, index) => [superset.id, `copy-superset-${index}-${crypto.randomUUID()}`]));
    const membershipByExercise = new Map<number, string[]>();
    source.supersets.forEach((superset) => {
      const members = superset.exerciseMemberships.length
        ? superset.exerciseMemberships
        : source.exercises.filter((exercise) => exercise.supersetId === superset.id).map((exercise) => ({ workoutExerciseId: exercise.id, position: exercise.supersetPosition ?? 0 }));
      members.forEach((member) => membershipByExercise.set(member.workoutExerciseId, [...(membershipByExercise.get(member.workoutExerciseId) ?? []), supersetKey.get(superset.id)!]));
    });
    const copied = await createUserWorkout(userId, {
      title: source.title ? `${source.title} (copy)` : "Workout copy",
      notes: source.notes,
      startedAt: null,
      completedAt: null,
      visibility: "PRIVATE",
      supersets: source.supersets.map((superset) => ({
        key: supersetKey.get(superset.id)!, label: superset.label, colorKey: superset.colorKey,
        restSeconds: superset.restSeconds, plannedRounds: superset.plannedRounds, hardRoundLimit: superset.hardRoundLimit,
        exerciseLocalIds: (superset.exerciseMemberships.length ? superset.exerciseMemberships : source.exercises.filter((exercise) => exercise.supersetId === superset.id).map((exercise) => ({ workoutExerciseId: exercise.id, position: exercise.supersetPosition ?? 0 })))
          .sort((a, b) => a.position - b.position).map((member) => localIds[source.exercises.findIndex((exercise) => exercise.id === member.workoutExerciseId)]),
      })),
      exercises: source.exercises.map((exercise, index) => ({
        localId: localIds[index], exerciseId: exercise.exerciseId, notes: exercise.notes, restSeconds: exercise.restSeconds,
        supersetKey: membershipByExercise.get(exercise.id)?.[0] ?? null, supersetPosition: null,
        sets: exercise.sets.map((set) => ({ reps: set.reps, weight: set.weight, durationSeconds: set.durationSeconds, distanceMeters: set.distanceMeters, steps: set.steps, floors: set.floors, rpe: set.rpe, notes: set.notes, completed: false, supersetRoundIndex: null, supersetRoundId: null })),
      })),
    });
    if (!copied) return createJsonErrorResponse("The workout contains unavailable exercises.", 400);
    return NextResponse.json({ workoutId: copied.id }, { status: 201 });
  } catch (error) {
    console.error("WORKOUT_COPY_FAILED", { sourceId, userId, error });
    return createInternalServerErrorResponse("WORKOUT_COPY_FAILED");
  }
}
