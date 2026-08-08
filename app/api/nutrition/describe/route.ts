import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { describeNutritionMeal, nutritionAiConfigured } from "@/lib/nutrition/ai-provider";
import { getNutritionAiQuotas, releaseNutritionAiQuota, reserveNutritionAiQuota } from "@/lib/nutrition/ai-quota";
import { getUserEntitlements } from "@/lib/entitlements";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const describeSchema = z
  .object({ description: z.string().trim().min(1).max(250) })
  .strict();

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }
  const parsed = describeSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Describe what you ate in 250 characters or fewer.",
      parsed.error.flatten().fieldErrors
    );
  }
  const { entitlements } = await getUserEntitlements(userId);
  if (!nutritionAiConfigured()) {
    return createJsonErrorResponse(
      "Meal descriptions are not configured. Set OPENAI_API_KEY on the server.",
      503,
      "AI_NOT_CONFIGURED"
    );
  }
  const reservation = await reserveNutritionAiQuota(userId, entitlements.isPro, "describe");
  if (!reservation) {
    const quota = (await getNutritionAiQuotas(userId, entitlements.isPro)).describe;
    return NextResponse.json(
      { error: "DAILY_LIMIT_REACHED", feature: "nutrition_describe", limit: quota.limit, message: entitlements.isPro ? "You've reached today's AI description limit. Your quota resets tomorrow." : "You've used today's free AI meal descriptions. Upgrade to Pro for 200 AI descriptions per day." },
      { status: 429 }
    );
  }

  try {
    return NextResponse.json(await describeNutritionMeal(parsed.data.description));
  } catch (error) {
    await releaseNutritionAiQuota(reservation);
    const code = error instanceof Error ? error.message : "AI_UNAVAILABLE";
    if (code === "AI_MALFORMED_RESPONSE") {
      return createJsonErrorResponse(
        "We couldn't identify any foods. Try describing the meal differently.",
        502,
        code
      );
    }
    return createJsonErrorResponse(
      "Meal descriptions are temporarily unavailable.",
      code === "AI_RATE_LIMITED" ? 429 : 503,
      code
    );
  }
}
