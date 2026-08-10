import { NextResponse } from "next/server";
import { createInternalServerErrorResponse, createJsonErrorResponse } from "@/lib/api-response";
import { createUnauthorizedResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { foodContributionFilters, getFoodContributionHistory, type FoodContributionFilter } from "@/lib/nutrition/admin-food-contributions";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return createUnauthorizedResponse();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  if (!(foodContributionFilters as readonly string[]).includes(status)) return createJsonErrorResponse("Invalid contribution status.", 400);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  try {
    return NextResponse.json(await getFoodContributionHistory({ status: status as FoodContributionFilter, limit, cursor: url.searchParams.get("cursor") }));
  } catch (error) { console.error("ADMIN_FOOD_CONTRIBUTIONS_LIST_FAILED", error); return createInternalServerErrorResponse(); }
}
