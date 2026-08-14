import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { nutritionDate, nutritionDateSchema } from "@/lib/nutrition/log";
import { nutritionGoalSchema } from "@/lib/nutrition/goals";
import { getNutritionGoalForDate } from "@/lib/nutrition/goal-service";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const date = new URL(request.url).searchParams.get("date");
  const parsed = nutritionDateSchema.safeParse(
    date ?? new Date().toISOString().slice(0, 10)
  );
  if (!parsed.success)
    return createJsonValidationErrorResponse("Invalid nutrition date.", {
      date: ["Use YYYY-MM-DD."],
    });
  return NextResponse.json(await getNutritionGoalForDate(userId, parsed.data));
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }
  const parsed = nutritionGoalSchema.safeParse(body);
  if (!parsed.success)
    return createJsonValidationErrorResponse(
      "Invalid nutrition goal.",
      parsed.error.flatten().fieldErrors
    );
  const { effectiveFrom: requestedEffectiveFrom, ...goalValues } = parsed.data;
  const effectiveFrom =
    requestedEffectiveFrom ?? new Date().toISOString().slice(0, 10);
  if (!nutritionDateSchema.safeParse(effectiveFrom).success)
    return createJsonValidationErrorResponse("Invalid nutrition goal date.", {
      effectiveFrom: ["Use YYYY-MM-DD."],
    });
  try {
    const goal = await prisma.nutritionGoal.upsert({
      where: {
        userId_effectiveFrom: {
          userId,
          effectiveFrom: nutritionDate(effectiveFrom),
        },
      },
      create: {
        userId,
        effectiveFrom: nutritionDate(effectiveFrom),
        ...goalValues,
      },
      update: {
        caloriesKcal: goalValues.caloriesKcal,
        proteinGrams: goalValues.proteinGrams,
        carbohydrateGrams: goalValues.carbohydrateGrams,
        fatGrams: goalValues.fatGrams,
      },
    });
    return NextResponse.json({
      caloriesKcal: Number(goal.caloriesKcal),
      proteinGrams: Number(goal.proteinGrams),
      carbohydrateGrams: Number(goal.carbohydrateGrams),
      fatGrams: Number(goal.fatGrams),
      effectiveFrom,
    });
  } catch (error) {
    console.error("NUTRITION_GOAL_UPDATE_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
