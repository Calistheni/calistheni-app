import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { getUserEntitlements } from "@/lib/entitlements";
import { getAuthenticatedUserId, createUserUnauthorizedResponse } from "@/lib/user-auth";
import { releaseNutritionAiQuota, reserveNutritionAiQuota } from "@/lib/nutrition/ai-quota";
import { missingFoodProposalSchema, proposeMissingFood, saveMissingFood } from "@/lib/nutrition/missing-food";

const requestSchema = z.object({ action: z.enum(["generate", "save"]), name: z.string().trim().min(2).max(120).optional(), context: z.string().trim().max(200).nullable().optional(), proposal: missingFoodProposalSchema.optional() }).strict();

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createJsonValidationErrorResponse("Enter a valid generic food proposal.", parsed.error.flatten().fieldErrors);
  if (parsed.data.action === "save") {
    if (!parsed.data.proposal) return createJsonErrorResponse("Missing food proposal.", 400);
    const saved = await saveMissingFood(userId, parsed.data.proposal);
    return NextResponse.json(saved, { status: saved.duplicate ? 200 : 201 });
  }
  if (!parsed.data.name) return createJsonErrorResponse("Missing food name.", 400);
  const { entitlements } = await getUserEntitlements(userId);
  const reservation = await reserveNutritionAiQuota(userId, entitlements.isPro, "describe");
  if (!reservation) return createJsonErrorResponse("You've reached today's AI proposal limit.", 429, "DAILY_LIMIT_REACHED");
  try {
    return NextResponse.json(await proposeMissingFood({ name: parsed.data.name, context: parsed.data.context }));
  } catch (error) {
    await releaseNutritionAiQuota(reservation);
    const code = error instanceof Error ? error.message : "AI_UNAVAILABLE";
    return createJsonErrorResponse("We couldn't prepare a nutrition proposal right now.", code === "AI_RATE_LIMITED" ? 429 : 503, code);
  }
}
