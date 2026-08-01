import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { searchFoods } from "@/lib/nutrition/service";
import { normalizeFoodQuery } from "@/lib/nutrition/normalization";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
export async function GET(request: Request) { if (!(await getAuthenticatedUserId())) return createUserUnauthorizedResponse(); const query = new URL(request.url).searchParams.get("q") ?? ""; const normalized = normalizeFoodQuery(query); if (normalized.length < 2 || normalized.length > 100) return createJsonErrorResponse("Search must be between 2 and 100 characters.", 400); try { return NextResponse.json(await searchFoods(query)); } catch (error) { console.error("NUTRITION_SEARCH_FAILED", { queryLength: normalized.length, error }); return createInternalServerErrorResponse("NUTRITION_SEARCH_FAILED"); } }
