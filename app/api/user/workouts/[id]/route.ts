import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";
import { recomputeUserPersonalRecords } from "@/lib/personal-records";
import {
  mapWorkoutDetail,
  updateUserWorkout,
  userWorkoutInclude,
} from "@/lib/workouts";
import { workoutMutationSchema } from "@/lib/validation/workouts";
import { deleteWorkoutPhotoObject } from "@/lib/workout-photo-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const workoutId = parsePositiveInteger(id);

  if (workoutId === null) {
    return createJsonErrorResponse("Invalid workout id.", 400);
  }

  try {
    const workout = await prisma.workout.findFirst({
      where: {
        id: workoutId,
        userId,
      },
      include: userWorkoutInclude,
    });

    if (!workout) {
      return createJsonErrorResponse("Workout not found.", 404);
    }

    return NextResponse.json(mapWorkoutDetail(workout));
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const workoutId = parsePositiveInteger(id);

  if (workoutId === null) {
    return createJsonErrorResponse("Invalid workout id.", 400);
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
    const workout = await updateUserWorkout(userId, workoutId, parsedBody.data);

    if (!workout) {
      return createJsonErrorResponse("Workout not found.", 404);
    }

    return NextResponse.json(workout);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  const { id } = await params;
  const workoutId = parsePositiveInteger(id);

  if (workoutId === null) {
    return createJsonErrorResponse("Invalid workout id.", 400);
  }

  try {
    const existingWorkout = await prisma.workout.findFirst({
      where: {
        id: workoutId,
        userId,
      },
      select: {
        id: true,
        photos: { select: { storageKey: true } },
      },
    });

    if (!existingWorkout) {
      return createJsonErrorResponse("Workout not found.", 404);
    }

    // R2 has no foreign keys. Remove private objects before the cascading
    // database delete so a deleted workout cannot leave accessible media behind.
    await Promise.all(existingWorkout.photos.map((photo) => deleteWorkoutPhotoObject(photo.storageKey)));
    await prisma.workout.delete({
      where: {
        id: workoutId,
      },
    });
    await recomputeUserPersonalRecords(userId);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
