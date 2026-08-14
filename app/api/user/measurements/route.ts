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
import { FREE_MEASUREMENT_HISTORY_LIMIT } from "@/lib/anthropometry";
import { getUserSubscription, hasProAccess } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import {
  mergeMeasurementSnapshot,
  measurementSchema,
  validateStoredMeasurementCapabilities,
  type MeasurementField,
  type MeasurementSnapshotValues,
} from "@/lib/progress";
import {
  diffMeasurementState,
  latestMeasurementSnapshot,
} from "@/lib/latest-body-measurements";

const PRO_ONLY_RESPONSE_FIELDS = [
  "bodyFatPercentage",
  "shouldersCm",
  "hipsCm",
  "forearmCm",
  "wristCm",
  "thighCm",
  "calfCm",
  "ankleCm",
  "upperChestCm",
  "waistNarrowestCm",
  "abdomenCm",
  "glutesCm",
  "pelvisCm",
  "leftUpperArmRelaxedCm",
  "rightUpperArmRelaxedCm",
  "leftForearmCm",
  "rightForearmCm",
  "leftThighCm",
  "rightThighCm",
  "leftCalfCm",
  "rightCalfCm",
  "leftWristCm",
  "rightWristCm",
  "leftAnkleCm",
  "rightAnkleCm",
] as const;

class FreeMeasurementLimitError extends Error {}

function validationErrors(errors: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(errors).map(([key, error]) => [key, [error]])
  );
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  try {
    const entries = await prisma.bodyMeasurementEntry.findMany({
      where: { userId },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    });
    const isPro = hasProAccess(await getUserSubscription(userId));
    const visibleEntries = isPro
      ? entries
      : entries.map((entry) =>
          Object.fromEntries(
            Object.entries(entry).map(([key, value]) => [
              key,
              PRO_ONLY_RESPONSE_FIELDS.includes(key as never) ? null : value,
            ])
          )
        );
    return NextResponse.json(visibleEntries);
  } catch (error) {
    console.error(error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }

  const parsed = measurementSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid measurement entry.",
      parsed.error.flatten().fieldErrors
    );
  }

  const {
    clearFields,
    measuredAt,
    note,
    source,
    healthExportKinds,
    ...submitted
  } = parsed.data as {
    clearFields: MeasurementField[];
    measuredAt: Date;
    note?: string | null;
    source: "MANUAL" | "APPLE_HEALTH";
    healthExportKinds: string[];
  } & MeasurementSnapshotValues;
  const hasSubmittedNote =
    typeof body === "object" && body !== null && Object.hasOwn(body, "note");
  const isPro = hasProAccess(await getUserSubscription(userId));
  const capabilityValidation = validateStoredMeasurementCapabilities(
    submitted,
    isPro
  );
  if (!capabilityValidation.success) {
    return createJsonValidationErrorResponse(
      "Some measurements require Pro.",
      validationErrors(capabilityValidation.errors)
    );
  }
  const clearCapabilityValidation = validateStoredMeasurementCapabilities(
    Object.fromEntries(
      clearFields.map((field) => [field, 1])
    ) as MeasurementSnapshotValues,
    isPro
  );
  if (!clearCapabilityValidation.success) {
    return createJsonValidationErrorResponse(
      "Some measurements require Pro.",
      validationErrors(clearCapabilityValidation.errors)
    );
  }

  try {
    const entry = await prisma.$transaction(
      async (tx) => {
        if (!isPro) {
          const count = await tx.bodyMeasurementEntry.count({
            where: { userId },
          });
          if (count >= FREE_MEASUREMENT_HISTORY_LIMIT)
            throw new FreeMeasurementLimitError();
        }
        const entries = await tx.bodyMeasurementEntry.findMany({
          where: { userId },
          orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
        });
        const latest = entries[0] ?? null;
        const previous = latestMeasurementSnapshot(entries);
        const merged = mergeMeasurementSnapshot(
          previous,
          submitted,
          clearFields
        );
        const changedFields = diffMeasurementState(previous, merged);
        if (!changedFields.length) throw new Error("NoMeasurementChanges");
        const created = await tx.bodyMeasurementEntry.create({
          data: {
            userId,
            measuredAt,
            source,
            healthExportKinds: source === "MANUAL" ? healthExportKinds : [],
            changedFields,
            note: hasSubmittedNote ? note ?? null : latest?.note ?? null,
            ...merged,
          },
        });
        if (created.bodyweightKg != null) {
          await tx.user.update({
            where: { id: userId },
            data: { bodyweightKg: created.bodyweightKg.toNumber() },
          });
        }
        return created;
      },
      { isolationLevel: "Serializable" }
    );
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof FreeMeasurementLimitError) {
      return createJsonErrorResponse(
        `Free users can keep up to ${FREE_MEASUREMENT_HISTORY_LIMIT} measurement entries.`,
        403
      );
    }
    if (error instanceof Error && error.message === "NoMeasurementChanges") {
      return createJsonErrorResponse(
        "Change at least one measurement before saving a check-in.",
        400
      );
    }
    console.error(error);
    return createInternalServerErrorResponse();
  }
}
