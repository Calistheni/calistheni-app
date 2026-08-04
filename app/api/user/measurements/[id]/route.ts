import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { getUserSubscription, hasProAccess } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { measurementSchema, validateStoredMeasurementCapabilities, type MeasurementField, type MeasurementSnapshotValues } from "@/lib/progress";

function validationErrors(errors: Record<string, string>) {
  return Object.fromEntries(Object.entries(errors).map(([key, error]) => [key, [error]]));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return createJsonErrorResponse("Invalid JSON payload.", 400); }
  const parsed = measurementSchema.partial().safeParse(body);
  if (!parsed.success) return createJsonValidationErrorResponse("Invalid measurement entry.", parsed.error.flatten().fieldErrors);
  const { clearFields = [], measuredAt, note, ...submitted } = parsed.data as {
    clearFields?: MeasurementField[]; measuredAt?: Date; note?: string | null;
  } & MeasurementSnapshotValues;
  const hasSubmittedNote = typeof body === "object" && body !== null && Object.hasOwn(body, "note");
  const isPro = hasProAccess(await getUserSubscription(userId));
  const capabilityValidation = validateStoredMeasurementCapabilities(submitted, isPro);
  if (!capabilityValidation.success) return createJsonValidationErrorResponse("Some measurements require Pro.", validationErrors(capabilityValidation.errors));
  const clearValidation = validateStoredMeasurementCapabilities(Object.fromEntries(clearFields.map((field) => [field, 1])) as MeasurementSnapshotValues, isPro);
  if (!clearValidation.success) return createJsonValidationErrorResponse("Some measurements require Pro.", validationErrors(clearValidation.errors));
  const clearData = Object.fromEntries(clearFields.map((field) => [field, null]));
  try {
    const result = await prisma.bodyMeasurementEntry.updateMany({ where: { id, userId }, data: { ...submitted, ...clearData, ...(measuredAt ? { measuredAt } : {}), ...(hasSubmittedNote ? { note: note ?? null } : {}) } });
    return result.count ? NextResponse.json({ ok: true }) : createJsonErrorResponse("Measurement not found.", 404);
  } catch (error) { console.error(error); return createInternalServerErrorResponse(); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const { id } = await params;
  try {
    const result = await prisma.bodyMeasurementEntry.deleteMany({ where: { id, userId } });
    return result.count ? NextResponse.json({ ok: true }) : createJsonErrorResponse("Measurement not found.", 404);
  } catch (error) { console.error(error); return createInternalServerErrorResponse(); }
}
