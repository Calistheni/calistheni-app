import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInternalServerErrorResponse,
  createJsonErrorResponse,
  createJsonValidationErrorResponse,
} from "@/lib/api-response";
import { serializeNutritionEntry } from "@/lib/nutrition/entry-serializer";
import { mealCategorySchema, nutritionDate, nutritionDateSchema } from "@/lib/nutrition/log";
import { nutritionEntryDataForSavedMealItem } from "@/lib/nutrition/saved-meals";
import { prisma } from "@/lib/prisma";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";

const logSchema = z
  .object({ date: nutritionDateSchema, mealCategory: mealCategorySchema })
  .strict();
const entryInclude = {
  food: {
    include: {
      aliases: { select: { name: true } },
      details: { select: { categories: true, productImageUrl: true } },
    },
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return createUserUnauthorizedResponse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createJsonErrorResponse("Invalid JSON payload.", 400);
  }
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonValidationErrorResponse(
      "Invalid meal log.",
      parsed.error.flatten().fieldErrors
    );
  }
  try {
    const meal = await prisma.nutritionSavedMeal.findFirst({
      where: { id: (await params).id, userId },
      include: { items: { include: { foodRevision: true } } },
    });
    if (!meal) return createJsonErrorResponse("Meal not found.", 404);
    if (!meal.items.length) return createJsonErrorResponse("Meal has no items.", 409);
    const created = await prisma.$transaction(
      meal.items.map((item) =>
        prisma.nutritionEntrySnapshot.create({
          data: {
            userId,
            loggedFor: nutritionDate(parsed.data.date),
            mealCategory: parsed.data.mealCategory,
            ...nutritionEntryDataForSavedMealItem(item),
          },
        })
      )
    );
    const entries = await prisma.nutritionEntrySnapshot.findMany({
      where: { id: { in: created.map((entry) => entry.id) }, userId },
      include: entryInclude,
    });
    const order = new Map(created.map((entry, index) => [entry.id, index]));
    return NextResponse.json(
      { entries: entries.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(serializeNutritionEntry) },
      { status: 201 }
    );
  } catch (error) {
    console.error("NUTRITION_MEAL_LOG_FAILED", error);
    return createInternalServerErrorResponse();
  }
}
