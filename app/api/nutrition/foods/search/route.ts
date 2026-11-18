import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { searchFoods, searchLocalFoods } from "@/lib/nutrition/service";
import { normalizeFoodQuery } from "@/lib/nutrition/normalization";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid nutrition search request.", 400);
  }
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const query = typeof input.query === "string" ? input.query : "";
  const localOnly = input.localOnly === true;
  const normalized = normalizeFoodQuery(query);
  if (normalized.length < 2 || normalized.length > 100) {
    return createJsonErrorResponse("Search must be between 2 and 100 characters.", 400);
  }

  try {
    if (localOnly) {
      return NextResponse.json({ results: await searchLocalFoods(query, userId) }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(await searchFoods(query, userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    console.error("NUTRITION_SEARCH_FAILED", { queryLength: normalized.length });
    return createInternalServerErrorResponse("NUTRITION_SEARCH_FAILED");
  }
}
