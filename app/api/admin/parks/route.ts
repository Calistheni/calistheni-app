import { NextResponse } from "next/server";
import { searchAdminParks } from "@/lib/admin-parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
} from "@/lib/api-response";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  ADMIN_PARK_SEARCH_LIMIT,
  parseParkArchiveStatus,
  parseParkQrStatus,
} from "@/lib/park-map-query";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();

  const url = new URL(request.url);
  const qrStatus = parseParkQrStatus(url.searchParams.get("qrStatus"), {
    allowAll: true,
  });
  const query = url.searchParams.get("q")?.trim() ?? "";
  const cursorRaw = url.searchParams.get("cursor");
  const cursor =
    cursorRaw === null || cursorRaw === ""
      ? null
      : Number.parseInt(cursorRaw, 10);

  if (qrStatus === null) {
    return createJsonErrorResponse(
      "Invalid QR status filter.",
      400,
      "PARK_QR_STATUS_INVALID"
    );
  }
  const archiveStatus = parseParkArchiveStatus(
    url.searchParams.get("parkStatus"),
    { allowAll: true }
  );
  if (archiveStatus === null) {
    return createJsonErrorResponse(
      "Invalid park status filter.",
      400,
      "PARK_STATUS_INVALID"
    );
  }
  if (query.length === 1 || (cursor !== null && (!Number.isInteger(cursor) || cursor <= 0))) {
    return createJsonErrorResponse(
      "Invalid park search parameters.",
      400,
      "ADMIN_PARK_SEARCH_INVALID"
    );
  }

  try {
    return NextResponse.json(
      await searchAdminParks({
        query,
        qrStatus,
        archiveStatus,
        cursor,
        limit: ADMIN_PARK_SEARCH_LIMIT,
      }),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("ADMIN_PARK_SEARCH_FAILED", {
      route: "/api/admin/parks",
      query,
      qrStatus,
      archiveStatus,
      prismaCode:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined,
    });
    return createInternalServerErrorResponse("ADMIN_PARK_SEARCH_FAILED");
  }
}
