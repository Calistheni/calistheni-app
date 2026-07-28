import { NextResponse } from "next/server";
import { getAdminParkQrCounts } from "@/lib/admin-parks";
import { createInternalServerErrorResponse } from "@/lib/api-response";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  parseParkArchiveStatus,
  parseParkQrStatus,
} from "@/lib/park-map-query";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();

  const url = new URL(request.url);
  const qrStatus = parseParkQrStatus(url.searchParams.get("qrStatus"), {
    allowAll: true,
  });
  const archiveStatus = parseParkArchiveStatus(
    url.searchParams.get("parkStatus"),
    { allowAll: true }
  );
  if (qrStatus === null || archiveStatus === null) {
    return NextResponse.json(
      { error: "Invalid park filters.", code: "PARK_FILTER_INVALID" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await getAdminParkQrCounts({ qrStatus, archiveStatus }),
      {
      headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    console.error("ADMIN_PARK_COUNTS_FAILED", {
      route: "/api/admin/parks/summary",
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
    return createInternalServerErrorResponse("ADMIN_PARK_COUNTS_FAILED");
  }
}
