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
        exercises: {
          orderBy: {
            order: "asc",
          },
          include: {
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

    const result = await createUserRoutine(userId, {
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : workout.title
            ? `${workout.title} Routine`
            : "Workout Routine",
      description: workout.notes,
      visibility: "PRIVATE",
      exercises: workout.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        restSeconds: exercise.restSeconds,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          reps: set.reps,
          weightKg: set.weight,
          durationSec: set.durationSeconds,
        })),
      })),
    });

    if ("routine" in result) {
      return NextResponse.json(result.routine, { status: 201 });
    }

    return createJsonErrorResponse(result.error, 400);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
