import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { consumeNutritionAiRateLimit } from "@/lib/nutrition/ai-rate-limit";
import { describeNutritionMeal, nutritionAiConfigured } from "@/lib/nutrition/ai-provider";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const describeSchema = z
  .object({ description: z.string().trim().min(1).max(300) })
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
      "Describe what you ate in 300 characters or fewer.",
      parsed.error.flatten().fieldErrors
    );
  }
  if (!nutritionAiConfigured()) {
    return createJsonErrorResponse(
      "Meal descriptions are not configured. Set OPENAI_API_KEY on the server.",
      503,
      "AI_NOT_CONFIGURED"
    );
  }
  const retryAfterSeconds = consumeNutritionAiRateLimit(userId);
  if (retryAfterSeconds !== null) {
    return NextResponse.json(
      { error: "Too many meal descriptions. Try again shortly.", code: "AI_RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    return NextResponse.json(await describeNutritionMeal(parsed.data.description));
  } catch (error) {
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
