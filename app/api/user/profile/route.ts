import { NextResponse } from "next/server";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { prisma } from "@/lib/prisma";

type ProfileUpdatePayload = {
  bodyweightKg?: unknown;
  trainingStyle?: unknown;
  primaryGoal?: unknown;
  onboardingCompleted?: unknown;
};

const TRAINING_STYLES = ["CALISTHENICS", "GYM", "BOTH"] as const;
const PRIMARY_GOALS = ["FIND_PARKS", "TRACK_WORKOUTS", "BOTH"] as const;

function parseBodyweightKg(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 20 || parsedValue > 300) {
    return undefined;
  }

  return parsedValue;
}

function hasField<T extends object>(body: T, field: keyof ProfileUpdatePayload) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function parseTrainingStyle(
  value: unknown
): (typeof TRAINING_STYLES)[number] | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return typeof value === "string" &&
    TRAINING_STYLES.includes(value as (typeof TRAINING_STYLES)[number])
    ? (value as (typeof TRAINING_STYLES)[number])
    : undefined;
}

function parsePrimaryGoal(
  value: unknown
): (typeof PRIMARY_GOALS)[number] | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return typeof value === "string" &&
    PRIMARY_GOALS.includes(value as (typeof PRIMARY_GOALS)[number])
    ? (value as (typeof PRIMARY_GOALS)[number])
    : undefined;
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: ProfileUpdatePayload;

  try {
    body = (await request.json()) as ProfileUpdatePayload;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const data: {
    bodyweightKg?: number | null;
    trainingStyle?: (typeof TRAINING_STYLES)[number] | null;
    primaryGoal?: (typeof PRIMARY_GOALS)[number] | null;
    onboardingCompleted?: boolean;
  } = {};

  if (hasField(body, "bodyweightKg")) {
    const bodyweightKg = parseBodyweightKg(body.bodyweightKg);

    if (bodyweightKg === undefined) {
      return createJsonErrorResponse(
        "Bodyweight must be between 20 and 300 kg.",
        400
      );
    }

    data.bodyweightKg = bodyweightKg;
  }

  if (hasField(body, "trainingStyle")) {
    const trainingStyle = parseTrainingStyle(body.trainingStyle);

    if (trainingStyle === undefined) {
      return createJsonErrorResponse("Invalid training style.", 400);
    }

    data.trainingStyle = trainingStyle;
  }

  if (hasField(body, "primaryGoal")) {
    const primaryGoal = parsePrimaryGoal(body.primaryGoal);

    if (primaryGoal === undefined) {
      return createJsonErrorResponse("Invalid primary goal.", 400);
    }

    data.primaryGoal = primaryGoal;
  }

  if (hasField(body, "onboardingCompleted")) {
    if (typeof body.onboardingCompleted !== "boolean") {
      return createJsonErrorResponse("Invalid onboarding status.", 400);
    }

    data.onboardingCompleted = body.onboardingCompleted;
  }

  try {
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data,
      select: {
        bodyweightKg: true,
        trainingStyle: true,
        primaryGoal: true,
        onboardingCompleted: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
