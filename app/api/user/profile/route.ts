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
import { assertTrustedAuthOrigin } from "@/lib/auth/security";
import { validateDisplayName } from "@/lib/display-name";
import {
  calculateAge,
  formatDateOfBirth,
  validateDateOfBirth,
} from "@/lib/date-of-birth";
import { prisma } from "@/lib/prisma";

type ProfileUpdatePayload = {
  firstName?: unknown;
  familyName?: unknown;
  bodyweightKg?: unknown;
  measurementSystem?: unknown;
  dateOfBirth?: unknown;
  trainingStyle?: unknown;
  primaryGoal?: unknown;
  onboardingCompleted?: unknown;
  rpeTrackingEnabled?: unknown;
  weeklyWorkoutGoal?: unknown;
  bodyFatSex?: unknown;
  appleHealthWorkoutExportEnabled?: unknown;
  appleHealthBodyweightImportEnabled?: unknown;
  appleHealthBodyMeasurementExportEnabled?: unknown;
  bodyweightSource?: unknown;
};

const TRAINING_STYLES = ["CALISTHENICS", "GYM", "BOTH"] as const;
const PRIMARY_GOALS = ["FIND_PARKS", "TRACK_WORKOUTS", "BOTH"] as const;
const BODY_FAT_SEXES = ["MALE", "FEMALE"] as const;
const MEASUREMENT_SYSTEMS = ["METRIC", "IMPERIAL"] as const;
const NAME_REQUIRED = "Enter your first name to continue.";

class OnboardingNameRequiredError extends Error {}

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

function parseBodyFatSex(value: unknown): (typeof BODY_FAT_SEXES)[number] | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && BODY_FAT_SEXES.includes(value as (typeof BODY_FAT_SEXES)[number])
    ? value as (typeof BODY_FAT_SEXES)[number]
    : undefined;
}

function parseMeasurementSystem(value: unknown): (typeof MEASUREMENT_SYSTEMS)[number] | undefined {
  return typeof value === "string" && MEASUREMENT_SYSTEMS.includes(value as (typeof MEASUREMENT_SYSTEMS)[number])
    ? value as (typeof MEASUREMENT_SYSTEMS)[number]
    : undefined;
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return createUserUnauthorizedResponse();
  }

  let body: ProfileUpdatePayload;

  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return createJsonErrorResponse("Invalid JSON payload.", 400);
    }
    body = input;
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const data: {
    firstName?: string;
    familyName?: string | null;
    name?: string;
    bodyweightKg?: number | null;
    measurementSystem?: (typeof MEASUREMENT_SYSTEMS)[number];
    dateOfBirth?: Date | null;
    trainingStyle?: (typeof TRAINING_STYLES)[number] | null;
    primaryGoal?: (typeof PRIMARY_GOALS)[number] | null;
    onboardingCompleted?: boolean;
    rpeTrackingEnabled?: boolean;
    weeklyWorkoutGoal?: number;
    bodyFatSex?: (typeof BODY_FAT_SEXES)[number] | null;
    appleHealthWorkoutExportEnabled?: boolean;
  appleHealthBodyweightImportEnabled?: boolean;
  appleHealthBodyMeasurementExportEnabled?: boolean;
  } = {};

  const bodyweightSource = body.bodyweightSource === "APPLE_HEALTH" ? "APPLE_HEALTH" : "MANUAL";

  if (hasField(body, "firstName") || hasField(body, "familyName")) {
    try {
      assertTrustedAuthOrigin(request);
    } catch {
      return createJsonErrorResponse("Invalid profile update request.", 403);
    }
    const validated = validateDisplayName(body.firstName, body.familyName);
    if (!validated.ok) {
      const { firstName, familyName } = validated.errors;
      return createJsonValidationErrorResponse("Check your display name.", {
        firstName: firstName ? [firstName] : undefined,
        familyName: familyName ? [familyName] : undefined,
      });
    }
    data.firstName = validated.fields.firstName;
    data.familyName = validated.fields.familyName || null;
    data.name = validated.name;
  }

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

  if (hasField(body, "measurementSystem")) {
    const measurementSystem = parseMeasurementSystem(body.measurementSystem);
    if (!measurementSystem) return createJsonErrorResponse("Invalid measurement system.", 400);
    data.measurementSystem = measurementSystem;
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

  if (hasField(body, "bodyFatSex")) {
    const bodyFatSex = parseBodyFatSex(body.bodyFatSex);
    if (bodyFatSex === undefined) return createJsonErrorResponse("Invalid body-fat sex value.", 400);
    data.bodyFatSex = bodyFatSex;
  }

  for (const field of [
    "appleHealthWorkoutExportEnabled",
    "appleHealthBodyweightImportEnabled",
    "appleHealthBodyMeasurementExportEnabled",
  ] as const) {
    if (hasField(body, field)) {
      if (typeof body[field] !== "boolean") {
        return createJsonErrorResponse("Invalid Apple Health preference.", 400);
      }
      data[field] = body[field];
    }
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const needsName = data.onboardingCompleted === true && !data.name;
      const current = needsName || hasField(body, "bodyweightKg")
        ? await tx.user.findUnique({
            where: { id: userId },
            select: { bodyweightKg: true, name: true, onboardingCompleted: true },
          })
        : null;
      if (needsName && current && !current.onboardingCompleted && !current.name?.trim()) {
        throw new OnboardingNameRequiredError();
      }
      const updated = await tx.user.update({
      where: {
        id: userId,
        deletedAt: null,
      },
      data,
      select: {
        name: true,
        bodyweightKg: true,
        measurementSystem: true,
        dateOfBirth: true,
        trainingStyle: true,
        primaryGoal: true,
        onboardingCompleted: true,
        rpeTrackingEnabled: true,
        weeklyWorkoutGoal: true,
        bodyFatSex: true,
        appleHealthWorkoutExportEnabled: true,
        appleHealthBodyweightImportEnabled: true,
        appleHealthBodyMeasurementExportEnabled: true,
      },
      });
      const bodyweightChanged = hasField(body, "bodyweightKg") && updated.bodyweightKg !== current?.bodyweightKg;
      const bodyweightMeasurement = bodyweightChanged && updated.bodyweightKg != null
        ? await tx.bodyMeasurementEntry.create({ data: { userId, bodyweightKg: updated.bodyweightKg, measuredAt: new Date(), source: bodyweightSource, healthExportKinds: bodyweightSource === "MANUAL" ? ["BODY_WEIGHT"] : [] }, select: { id: true, measuredAt: true, bodyweightKg: true, source: true, healthExportKinds: true } })
        : null;
      return { ...updated, bodyweightMeasurement };
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
    if (error instanceof OnboardingNameRequiredError) {
      return createJsonValidationErrorResponse(NAME_REQUIRED, { firstName: [NAME_REQUIRED] });
    }
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
