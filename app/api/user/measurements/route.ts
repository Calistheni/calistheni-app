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
import { FREE_MEASUREMENT_HISTORY_LIMIT, MEASUREMENT_CATALOGUE } from "@/lib/anthropometry";
import type { BodyMeasurementEntry } from "@/lib/generated/prisma/client";
import { getUserEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import {
  mergeMeasurementSnapshot,
  LEGACY_MEASUREMENT_KEY_MAP,
  MEASUREMENT_FIELDS,
  measurementSchema,
  validateStoredMeasurementCapabilities,
  type MeasurementField,
  type MeasurementSnapshotValues,
} from "@/lib/progress";
import {
  diffMeasurementState,
  latestMeasurementSnapshot,
} from "@/lib/latest-body-measurements";

const PRO_ONLY_RESPONSE_FIELDS = new Set<string>([
  ...MEASUREMENT_FIELDS.filter(
    (field) => MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]].availability === "PRO"
  ),
  // Historic storage fields no longer exposed as direct check-in inputs.
  "upperChestCm",
  "waistNarrowestCm",
  "abdomenCm",
  "glutesCm",
  "pelvisCm",
  "leftUpperArmRelaxedCm",
  "rightUpperArmRelaxedCm",
  "leftUpperArmCm",
  "rightUpperArmCm",
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
]);

function freeMeasurementEntry(entry: BodyMeasurementEntry) {
  return {
    ...entry,
    ...Object.fromEntries(Array.from(PRO_ONLY_RESPONSE_FIELDS, (key) => [key, null])),
    changedFields: entry.changedFields.filter((field) => !PRO_ONLY_RESPONSE_FIELDS.has(field)),
  };
}

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
    const { entitlements } = await getUserEntitlements(userId);
    const visibleEntries = entitlements.isPro ? entries : entries.map(freeMeasurementEntry);
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
  const { entitlements } = await getUserEntitlements(userId);
  const isPro = entitlements.isPro;
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
    return NextResponse.json(isPro ? entry : freeMeasurementEntry(entry), { status: 201 });
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
