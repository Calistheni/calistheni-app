import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { mealCategorySchema, nutritionDate, nutritionDateSchema, snapshotForFood } from "@/lib/nutrition/log";
import { serializeNutritionEntry } from "@/lib/nutrition/entry-serializer";

const itemSchema = z.object({
  foodId: z.string().cuid(),
  gramsConsumed: z.number().finite().positive().max(100_000),
  quantity: z.number().finite().positive().max(10_000).default(1),
  unit: z.string().trim().min(1).max(40).default("g"),
});
const batchSchema = z.object({ date: nutritionDateSchema, mealCategory: mealCategorySchema, items: z.array(itemSchema).min(1).max(20) }).strict();
const nutrientFields = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "sodiumMg", "saltGrams"] as const;

function createData(food: { id: string; currentRevision: Record<string, unknown> }, grams: number) {
  const revision = food.currentRevision;
  const values = Object.fromEntries(nutrientFields.map((field) => [field, revision[field] == null ? undefined : Number(revision[field])])) as Record<(typeof nutrientFields)[number], number | undefined>;
  const snapshot = snapshotForFood(values, grams);
  return {
    foodId: food.id, foodRevisionId: String(revision.id), foodNameSnapshot: String(revision.name), brandNameSnapshot: revision.brandName ? String(revision.brandName) : null,
    barcodeSnapshot: revision.barcode ? String(revision.barcode) : null, gramsConsumed: grams, nutritionBasisGramsSnapshot: Number(revision.nutritionBasisGrams),
    sourceSnapshot: revision.source as never, sourceExternalIdSnapshot: String(revision.sourceExternalId),
    ...Object.fromEntries(nutrientFields.map((field) => [`${field}Snapshot`, snapshot[field] ?? null])),
  };
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  let body: unknown; try { body = await request.json(); } catch { return createJsonErrorResponse("Invalid JSON payload.", 400); }
  const parsed = batchSchema.safeParse(body); if (!parsed.success) return createJsonValidationErrorResponse("Invalid nutrition batch.", parsed.error.flatten().fieldErrors);
  try {
    const ids = [...new Set(parsed.data.items.map((item) => item.foodId))];
    const foods = await prisma.food.findMany({ where: { id: { in: ids } }, include: { currentRevision: true } });
    if (foods.length !== ids.length || foods.some((food) => !food.currentRevision)) return createJsonErrorResponse("One or more foods are unavailable for logging.", 404);
    const byId = new Map(foods.map((food) => [food.id, food]));
    const created = await prisma.$transaction(parsed.data.items.map((item) => {
      const food = byId.get(item.foodId)!;
      return prisma.nutritionEntrySnapshot.create({ data: { userId, loggedFor: nutritionDate(parsed.data.date), mealCategory: parsed.data.mealCategory, quantity: item.quantity, unit: item.unit, ...createData(food as never, item.gramsConsumed) } });
    }));
    const entries = await prisma.nutritionEntrySnapshot.findMany({ where: { id: { in: created.map((entry) => entry.id) }, userId }, include: { food: { include: { aliases: { select: { name: true } }, details: { select: { categories: true, productImageUrl: true } } } } } });
    const order = new Map(created.map((entry, index) => [entry.id, index]));
    return NextResponse.json({ entries: entries.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(serializeNutritionEntry) }, { status: 201 });
  } catch (error) { console.error("NUTRITION_BATCH_CREATE_FAILED", error); return createInternalServerErrorResponse(); }
}
