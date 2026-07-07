import { NextResponse } from "next/server";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type { ExerciseTrackingType } from "@/types/workout";

type ExerciseClassificationPayload = {
  trackingType?: unknown;
  bodyweightLoadFactor?: unknown;
};

const TRACKING_TYPES: ExerciseTrackingType[] = [
  "NOT_SELECTED",
  "BODYWEIGHT_REPS",
  "WEIGHTED_BODYWEIGHT",
  "EXTERNAL_WEIGHT",
  "DURATION",
  "DISTANCE_DURATION",
  "STEPS_DISTANCE_DURATION",
  "FLOORS_DISTANCE_DURATION",
  "WEIGHT_DISTANCE_DURATION",
];

function isTrackingType(value: unknown): value is ExerciseTrackingType {
  return (
    typeof value === "string" &&
    TRACKING_TYPES.includes(value as ExerciseTrackingType)
  );
}

function usesBodyweightLoadFactor(trackingType: ExerciseTrackingType) {
  return (
    trackingType === "BODYWEIGHT_REPS" ||
    trackingType === "WEIGHTED_BODYWEIGHT"
  );
}

function parseBodyweightLoadFactor(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return createUnauthorizedResponse();
  }

  const { id } = await params;

  let body: ExerciseClassificationPayload;

  try {
    body = (await request.json()) as ExerciseClassificationPayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  if (!isTrackingType(body.trackingType)) {
    return createJsonErrorResponse("Invalid tracking type.", 400);
  }

  const bodyweightLoadFactor = parseBodyweightLoadFactor(
    body.bodyweightLoadFactor
  );

  if (
    body.bodyweightLoadFactor !== null &&
    body.bodyweightLoadFactor !== undefined &&
    body.bodyweightLoadFactor !== "" &&
    bodyweightLoadFactor === null
  ) {
    return createJsonErrorResponse(
      "Bodyweight load factor must be positive.",
      400
    );
  }

  try {
    const existingExercise = await prisma.exercise.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!existingExercise) {
      return createJsonErrorResponse("Exercise not found.", 404);
    }

    const exercise = await prisma.exercise.update({
      where: {
        id,
      },
      data: {
        trackingType: body.trackingType,
        bodyweightLoadFactor:
          usesBodyweightLoadFactor(body.trackingType)
            ? bodyweightLoadFactor ?? 1
            : null,
      },
      select: {
        id: true,
        name: true,
        muscle: true,
        trackingType: true,
        bodyweightLoadFactor: true,
      },
    });

    return NextResponse.json(exercise);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
