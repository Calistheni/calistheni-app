import { NextResponse } from "next/server";
import { getAdminParkDetail } from "@/lib/admin-parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import { getAdminActorLabel, isAdminAuthenticated } from "@/lib/admin-auth";
import { parseParkQrStatus } from "@/lib/park-map-query";
import {
  getParkQrUpdateData,
  MAX_PARK_QR_NOTE_LENGTH,
  normalizeParkQrNote,
} from "@/lib/park-qr";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/parks/[id]/qr">
) {
  if (!(await isAdminAuthenticated())) {
    return createJsonErrorResponse(
      "You are not authorized to update park QR status.",
      401,
      "PARK_QR_UPDATE_FORBIDDEN"
    );
  }
  const actorLabel = await getAdminActorLabel();

  const { id } = await context.params;
  const parkId = parsePositiveInteger(id);
  if (parkId === null) {
    return createJsonErrorResponse("Park not found.", 404, "PARK_NOT_FOUND");
  }

  let body: { status?: unknown; note?: unknown };
  let previousStatus: string | null = null;
  try {
    body = (await request.json()) as { status?: unknown; note?: unknown };
  } catch {
    return createJsonErrorResponse(
      "Invalid JSON payload.",
      400,
      "PARK_QR_STATUS_INVALID"
    );
  }

  const nextStatus = parseParkQrStatus(body.status);
  const note = normalizeParkQrNote(body.note);
  if (
    nextStatus === null ||
    nextStatus === "ALL" ||
    note === undefined
  ) {
    return createJsonErrorResponse(
      `Choose a valid QR status and keep the note under ${MAX_PARK_QR_NOTE_LENGTH} characters.`,
      400,
      "PARK_QR_STATUS_INVALID"
    );
  }

  try {
    const existing = await prisma.park.findFirst({
      where: { id: parkId, deletedAt: null },
      select: { id: true, qrStatus: true },
    });
    if (!existing) {
      return createJsonErrorResponse("Park not found.", 404, "PARK_NOT_FOUND");
    }
    previousStatus = existing.qrStatus;

    const now = new Date();
    await prisma.park.update({
      where: { id: parkId },
      data: getParkQrUpdateData({
        previousStatus: existing.qrStatus,
        nextStatus,
        note,
        actorLabel,
        now,
      }),
    });
    const park = await getAdminParkDetail(parkId);
    if (!park) {
      return createJsonErrorResponse("Park not found.", 404, "PARK_NOT_FOUND");
    }
    return NextResponse.json(park);
  } catch (error) {
    const prismaCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("PARK_QR_UPDATE_FAILED", {
      actor: actorLabel,
      parkId,
      previousStatus,
      requestedStatus: nextStatus,
      route: "/api/admin/parks/[id]/qr",
      prismaCode,
    });
    return createInternalServerErrorResponse("PARK_QR_UPDATE_FAILED");
  }
}
