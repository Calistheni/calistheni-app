import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import {
  createUserUnauthorizedResponse,
  getAuthenticatedUserId,
} from "@/lib/user-auth";
import { nutritionFoodVisibilityWhere } from "@/lib/nutrition/food-visibility";
import { toFoodSummary } from "@/lib/nutrition/service";

const foodIdSchema = z.object({ foodId: z.string().cuid() }).strict();
const foodInclude = {
  aliases: { select: { name: true } },
  details: { select: { categories: true, productImageUrl: true } },
  servings: {
    select: {
      name: true,
      quantity: true,
      grams: true,
      householdUnit: true,
      isDefault: true,
    },
  },
} as const;

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  try {
    const savedFoods = await prisma.nutritionSavedFood.findMany({
      where: { userId, food: nutritionFoodVisibilityWhere(userId) },
      include: { food: { include: foodInclude } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      foods: savedFoods.map(({ food }) => ({
        ...toFoodSummary(food),
        isSaved: true,
      })),
    });
  } catch (error) {
    console.error("NUTRITION_SAVED_FOODS_LOAD_FAILED", error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  const parsed = foodIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return createJsonValidationErrorResponse(
      "Invalid saved food.",
      parsed.error.flatten().fieldErrors
    );
  try {
    const food = await prisma.food.findFirst({
      where: {
        AND: [{ id: parsed.data.foodId }, nutritionFoodVisibilityWhere(userId)],
      },
      include: foodInclude,
    });
    if (!food) return createJsonErrorResponse("Food is unavailable.", 404);
    await prisma.nutritionSavedFood.upsert({
      where: { userId_foodId: { userId, foodId: food.id } },
      create: { userId, foodId: food.id },
      update: {},
    });
    return NextResponse.json({
      saved: true,
      foodId: food.id,
      food: { ...toFoodSummary(food), isSaved: true },
    });
  } catch (error) {
    console.error("NUTRITION_SAVED_FOOD_CREATE_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
