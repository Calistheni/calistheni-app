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
import { parseWeeklyWorkoutGoal } from "@/lib/home-dashboard";
import {
  calculateAge,
  formatDateOfBirth,
  validateDateOfBirth,
} from "@/lib/date-of-birth";
import { prisma } from "@/lib/prisma";

type ProfileUpdatePayload = {
  bodyweightKg?: unknown;
  dateOfBirth?: unknown;
  trainingStyle?: unknown;
  primaryGoal?: unknown;
  onboardingCompleted?: unknown;
  rpeTrackingEnabled?: unknown;
  weeklyWorkoutGoal?: unknown;
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
    dateOfBirth?: Date | null;
    trainingStyle?: (typeof TRAINING_STYLES)[number] | null;
    primaryGoal?: (typeof PRIMARY_GOALS)[number] | null;
    onboardingCompleted?: boolean;
    rpeTrackingEnabled?: boolean;
    weeklyWorkoutGoal?: number;
  } = {};

  if (hasField(body, "bodyweightKg")) {
    const bodyweightKg = parseBodyweightKg(body.bodyweightKg);

    if (bodyweightKg === undefined) {
      const error = "Bodyweight must be between 20 and 300 kg.";
      return createJsonValidationErrorResponse(
        error,
        { bodyweightKg: [error] }
      );
    }

    data.bodyweightKg = bodyweightKg;
  }

  if (hasField(body, "dateOfBirth")) {
    const dateOfBirth = validateDateOfBirth(body.dateOfBirth);

    if (!dateOfBirth.success) {
      return createJsonValidationErrorResponse(
        dateOfBirth.error,
        { dateOfBirth: [dateOfBirth.error] }
      );
    }

    data.dateOfBirth = dateOfBirth.date;
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

  if (hasField(body, "rpeTrackingEnabled")) {
    if (typeof body.rpeTrackingEnabled !== "boolean") {
      return createJsonErrorResponse("Invalid RPE tracking preference.", 400);
    }

    data.rpeTrackingEnabled = body.rpeTrackingEnabled;
  }

  if (hasField(body, "weeklyWorkoutGoal")) {
    const weeklyWorkoutGoal = parseWeeklyWorkoutGoal(body.weeklyWorkoutGoal);

    if (weeklyWorkoutGoal === null) {
      return createJsonErrorResponse(
        "Weekly workout goal must be between 1 and 7.",
        400
      );
    }

    data.weeklyWorkoutGoal = weeklyWorkoutGoal;
  }

  try {
    const user = await prisma.user.update({
      where: {
        id: userId,
      },
      data,
      select: {
        bodyweightKg: true,
        dateOfBirth: true,
        trainingStyle: true,
        primaryGoal: true,
        onboardingCompleted: true,
        rpeTrackingEnabled: true,
        weeklyWorkoutGoal: true,
      },
    });

    const { dateOfBirth, ...profile } = user;

    return NextResponse.json(
      hasField(body, "dateOfBirth")
        ? {
            ...profile,
            dateOfBirth: formatDateOfBirth(dateOfBirth),
            age: calculateAge(dateOfBirth),
          }
        : profile
    );
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
