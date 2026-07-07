import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { createUserWorkout, mapWorkoutSummary } from "@/lib/workouts";
import { workoutMutationSchema } from "@/lib/validation/workouts";

export async function GET() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  try {
    const workouts = await prisma.workout.findMany({
      where: {
        userId,
      },
      orderBy: {
        startedAt: "desc",
      },
      include: {
        exercises: {
          include: {
            exercise: true,
            sets: true,
          },
        },
      },
    });

    return NextResponse.json(workouts.map(mapWorkoutSummary));
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsedBody = workoutMutationSchema.safeParse(body);

  if (!parsedBody.success) {
    return createJsonValidationErrorResponse(
      "Invalid workout payload.",
      parsedBody.error.flatten().fieldErrors
    );
  }

  try {
    const workout = await createUserWorkout(userId, parsedBody.data);

    if (!workout) {
      return createJsonErrorResponse("One or more exercises were not found.", 400);
    }

    return NextResponse.json(workout, { status: 201 });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
