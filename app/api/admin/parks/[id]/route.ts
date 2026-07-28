import { NextResponse } from "next/server";
import { getAdminParkDetail } from "@/lib/admin-parks";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  parsePositiveInteger,
} from "@/lib/api-response";
import {
  createUnauthorizedResponse,
  isAdminAuthenticated,
} from "@/lib/admin-auth";

export async function GET(
  request: Request,
  context: RouteContext<"/api/admin/parks/[id]">
) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();

  const { id } = await context.params;
  const parkId = parsePositiveInteger(id);
  if (parkId === null) {
    return createJsonErrorResponse("Invalid park ID.", 400, "PARK_NOT_FOUND");
  }

  try {
    const park = await getAdminParkDetail(parkId, {
      includeArchived:
        new URL(request.url).searchParams.get("includeArchived") === "1",
    });
    if (!park) {
      return createJsonErrorResponse("Park not found.", 404, "PARK_NOT_FOUND");
    }
    return NextResponse.json(park, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    console.error("ADMIN_PARK_DETAIL_FAILED", {
      parkId,
      route: "/api/admin/parks/[id]",
    });
    return createInternalServerErrorResponse("ADMIN_PARK_DETAIL_FAILED");
  }
}
