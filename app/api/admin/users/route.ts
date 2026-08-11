import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { adminUserFilters, getAdminUsers, type AdminUserFilter } from "@/lib/admin-user-insights";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "ALL";
  if (!(adminUserFilters as readonly string[]).includes(filter)) return createJsonErrorResponse("Invalid user filter.", 400);
  try {
    return NextResponse.json(await getAdminUsers({ search: url.searchParams.get("q") ?? "", filter: filter as AdminUserFilter, cursor: url.searchParams.get("cursor") }));
  } catch (error) {
    console.error("ADMIN_USERS_LIST_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
