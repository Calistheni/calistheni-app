import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { serializeSavedMeal } from "@/lib/nutrition/saved-meals";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const itemSchema = z.object({
  foodId: z.string().cuid(),
  grams: z.number().finite().positive().max(100_000),
  quantity: z.number().finite().positive().max(10_000).default(1),
  unit: z.string().trim().min(1).max(40).default("g"),
});
const mealSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    items: z.array(itemSchema).min(1).max(20),
  })
  .strict();

const mealInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      food: {
        include: {
          aliases: { select: { name: true } },
          details: { select: { categories: true, productImageUrl: true } },
          servings: { select: { name: true, quantity: true, grams: true, householdUnit: true } },
        },
      },
      foodRevision: true,
    },
  },
};

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  try {
    const meals = await prisma.nutritionSavedMeal.findMany({
      where: { userId },
      include: mealInclude,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ meals: meals.map(serializeSavedMeal) });
  } catch (error) {
    console.error("NUTRITION_MEALS_GET_FAILED", error);
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }
  const parsed = mealSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid meal.",
      parsed.error.flatten().fieldErrors
    );
  }
  try {
    const foodIds = [...new Set(parsed.data.items.map((item) => item.foodId))];
    const foods = await prisma.food.findMany({
      where: { id: { in: foodIds } },
      select: { id: true, currentRevisionId: true },
    });
    if (foods.length !== foodIds.length || foods.some((food) => !food.currentRevisionId)) {
      return createJsonErrorResponse("One or more foods are unavailable.", 404);
    }
    const revisions = new Map(foods.map((food) => [food.id, food.currentRevisionId!]));
    const created = await prisma.nutritionSavedMeal.create({
      data: {
        userId,
        name: parsed.data.name,
        items: {
          create: parsed.data.items.map((item) => ({
            foodId: item.foodId,
            foodRevisionId: revisions.get(item.foodId)!,
            grams: item.grams,
            quantity: item.quantity,
            unit: item.unit,
          })),
        },
      },
      include: mealInclude,
    });
    return NextResponse.json(serializeSavedMeal(created), { status: 201 });
  } catch (error) {
    console.error("NUTRITION_MEALS_CREATE_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
