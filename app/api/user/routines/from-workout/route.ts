import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { createUserRoutine } from "@/lib/routines";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

type SaveFromWorkoutPayload = {
  workoutId?: unknown;
  name?: unknown;
};

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: SaveFromWorkoutPayload;

  try {
    body = (await request.json()) as SaveFromWorkoutPayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const workoutId = Number(body.workoutId);

  if (!Number.isInteger(workoutId) || workoutId <= 0) {
    return createJsonErrorResponse("Invalid workout id.", 400);
  }

  try {
    const workout = await prisma.workout.findFirst({
      where: {
        id: workoutId,
        userId,
      },
      include: {
        supersets: {
          orderBy: {
            order: "asc",
          },
          include: {
            exerciseMemberships: { orderBy: { position: "asc" } },
          },
        },
        exercises: {
          orderBy: {
            order: "asc",
          },
          include: {
            supersetMemberships: { orderBy: { position: "asc" } },
            sets: {
              orderBy: {
                order: "asc",
              },
            },
          },
        },
      },
    });

    if (!workout) {
      return createJsonErrorResponse("Workout not found.", 404);
    }
    const supersetKeyMap = new Map(
      workout.supersets.map((superset) => [
        superset.id,
        `superset-${crypto.randomUUID()}`,
      ])
    );
    const exerciseClientIdMap = new Map(
      workout.exercises.map((exercise) => [
        exercise.id,
        `routine-exercise-${crypto.randomUUID()}`,
      ])
    );

    const result = await createUserRoutine(userId, {
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : workout.title
            ? `${workout.title} Routine`
            : "Workout Routine",
      description: workout.notes,
      visibility: "PRIVATE",
      supersets: workout.supersets.map((superset) => ({
        key: supersetKeyMap.get(superset.id) ?? superset.id,
        label: superset.label,
        colorKey: superset.colorKey,
        restSeconds: superset.restSeconds,
        plannedRounds: superset.plannedRounds,
        hardRoundLimit: superset.hardRoundLimit,
        exerciseClientIds:
          superset.exerciseMemberships.length > 0
            ? superset.exerciseMemberships.map(
                (membership) =>
                  exerciseClientIdMap.get(membership.workoutExerciseId) ??
                  `routine-exercise-${membership.workoutExerciseId}`
              )
            : workout.exercises
                .filter((exercise) => exercise.supersetId === superset.id)
                .sort(
                  (left, right) =>
                    (left.supersetPosition ?? 0) -
                    (right.supersetPosition ?? 0)
                )
                .map(
                  (exercise) =>
                    exerciseClientIdMap.get(exercise.id) ??
                    `routine-exercise-${exercise.id}`
                ),
      })),
      exercises: workout.exercises.map((exercise) => ({
        clientExerciseId:
          exerciseClientIdMap.get(exercise.id) ??
          `routine-exercise-${exercise.id}`,
        routineExerciseId: null,
        exerciseId: exercise.exerciseId,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          reps: set.reps,
          weightKg: set.weight,
          durationSec: set.durationSeconds,
          distanceMeters: set.distanceMeters,
          steps: set.steps,
          floors: set.floors,
        })),
      })),
    });

    if ("routine" in result) {
      return NextResponse.json(result.routine, { status: 201 });
    }

    if ("code" in result && result.code === "ROUTINE_LIMIT_REACHED") {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: 403 }
      );
    }

    return createJsonErrorResponse(result.error, 400);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
