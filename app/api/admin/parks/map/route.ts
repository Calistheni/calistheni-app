import { NextResponse } from "next/server";
import { getAdminParksInBounds } from "@/lib/admin-parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  parseParkArchiveStatus,
  parseParkMapParams,
  parseParkQrStatus,
} from "@/lib/park-map-query";
import type { AdminParksMapResponse } from "@/types/park";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid map bounds or zoom.", 400, "PARK_BOUNDS_INVALID");
  }
  const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const params = new URLSearchParams(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" || typeof value === "number"
        ? [[key, String(value)]]
        : []
    )
  );
  const qrStatus = parseParkQrStatus(params.get("qrStatus"), {
    allowAll: true,
  });
  if (qrStatus === null) {
    return createJsonErrorResponse(
      "Invalid QR status filter.",
      400,
      "PARK_QR_STATUS_INVALID"
    );
  }
  const archiveStatus = parseParkArchiveStatus(
    params.get("parkStatus"),
    { allowAll: true }
  );
  if (archiveStatus === null) {
    return createJsonErrorResponse(
      "Invalid park status filter.",
      400,
      "PARK_STATUS_INVALID"
    );
  }

  const query = parseParkMapParams(
    params,
    `qr-${qrStatus}:park-${archiveStatus}`
  );
  if (!query.success) {
    return createJsonErrorResponse(query.message, 400, query.code);
  }

  try {
    const matches = await getAdminParksInBounds({
      bounds: query.bounds,
      limit: query.limit + 1,
      qrStatus,
      archiveStatus,
    });
    const parks = matches.slice(0, query.limit);
    const response: AdminParksMapResponse = {
      parks,
      areaKey: query.areaKey,
      version:
        parks.reduce<string | null>(
          (latest, park) =>
            latest === null || park.updatedAt > latest
              ? park.updatedAt
              : latest,
          null
        ),
      truncated: matches.length > query.limit,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const prismaCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("ADMIN_PARK_MAP_FAILED", {
      route: "/api/admin/parks/map",
      qrStatus,
      archiveStatus,
      prismaCode,
    });
    return createInternalServerErrorResponse("ADMIN_PARK_MAP_FAILED");
  }
}
