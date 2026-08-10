import { NextResponse } from "next/server";
import { createJsonErrorResponse, createInternalServerErrorResponse } from "@/lib/api-response";
import { searchFoods, searchLocalFoods } from "@/lib/nutrition/service";
import { normalizeFoodQuery } from "@/lib/nutrition/normalization";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
export async function GET(request: Request) { const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); const url = new URL(request.url); const query = url.searchParams.get("q") ?? ""; const normalized = normalizeFoodQuery(query); if (normalized.length < 2 || normalized.length > 100) return createJsonErrorResponse("Search must be between 2 and 100 characters.", 400); try { if (url.searchParams.get("localOnly") === "1") return NextResponse.json({ results: await searchLocalFoods(query, userId) }); return NextResponse.json(await searchFoods(query, userId)); } catch (error) { console.error("NUTRITION_SEARCH_FAILED", { queryLength: normalized.length, error }); return createInternalServerErrorResponse("NUTRITION_SEARCH_FAILED"); } }
