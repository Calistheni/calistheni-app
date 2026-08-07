import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInternalServerErrorResponse, createJsonErrorResponse, createJsonValidationErrorResponse } from "@/lib/api-response";
import { createUserUnauthorizedResponse, getAuthenticatedUserId } from "@/lib/user-auth";
import { serializeNutritionEntry } from "@/lib/nutrition/entry-serializer";
import { nutritionDate, nutritionDateSchema, nutritionEntrySchema, snapshotForFood } from "@/lib/nutrition/log";

const fields = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "sodiumMg", "saltGrams"] as const;
function values(record: Record<string, unknown>) { return Object.fromEntries(fields.map((key) => [key, record[key] == null ? undefined : Number(record[key])])) as Record<(typeof fields)[number], number | undefined>; }
function snapshotData(food: { currentRevision: Record<string, unknown> }, grams: number) {
  const revision = food.currentRevision; const calculated = snapshotForFood(values(revision), grams);
  return { foodRevisionId: String(revision.id), foodNameSnapshot: String(revision.name), brandNameSnapshot: revision.brandName ? String(revision.brandName) : null, barcodeSnapshot: revision.barcode ? String(revision.barcode) : null, gramsConsumed: grams, nutritionBasisGramsSnapshot: Number(revision.nutritionBasisGrams), sourceSnapshot: revision.source as never, sourceExternalIdSnapshot: String(revision.sourceExternalId), ...Object.fromEntries(fields.map((key) => [`${key}Snapshot`, calculated[key] ?? null])) };
}
export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse();
  const parsed = nutritionDateSchema.safeParse(new URL(request.url).searchParams.get("date")); if (!parsed.success) return createJsonValidationErrorResponse("Invalid nutrition date.", { date: ["Use YYYY-MM-DD."] });
  try { const [entries, targets] = await Promise.all([prisma.nutritionEntrySnapshot.findMany({ where: { userId, loggedFor: nutritionDate(parsed.data) }, include: { food: { include: { aliases: { select: { name: true } }, details: { select: { categories: true, productImageUrl: true } } } } }, orderBy: { createdAt: "asc" } }), prisma.userNutritionTargets.findUnique({ where: { userId } })]); return NextResponse.json({ entries: entries.map(serializeNutritionEntry), targets }); }
  catch (error) { console.error("NUTRITION_LOG_GET_FAILED", error); return createInternalServerErrorResponse(); }
}
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(); if (!userId) return createUserUnauthorizedResponse(); let body: unknown; try { body = await request.json(); } catch { return createJsonErrorResponse("Invalid JSON payload.", 400); }
  const parsed = nutritionEntrySchema.safeParse(body); if (!parsed.success) return createJsonValidationErrorResponse("Invalid nutrition entry.", parsed.error.flatten().fieldErrors);
  try { const food = await prisma.food.findUnique({ where: { id: parsed.data.foodId }, include: { currentRevision: true } }); if (!food?.currentRevision) return createJsonErrorResponse("Food is unavailable for logging.", 404); const created = await prisma.nutritionEntrySnapshot.create({ data: { userId, foodId: food.id, loggedFor: nutritionDate(parsed.data.date), mealCategory: parsed.data.mealCategory, quantity: parsed.data.quantity, unit: parsed.data.unit, ...snapshotData(food as never, parsed.data.gramsConsumed) } }); const entry = await prisma.nutritionEntrySnapshot.findUniqueOrThrow({ where: { id: created.id }, include: { food: { include: { aliases: { select: { name: true } }, details: { select: { categories: true, productImageUrl: true } } } } } }); return NextResponse.json(serializeNutritionEntry(entry), { status: 201 }); }
  catch (error) { console.error("NUTRITION_LOG_CREATE_FAILED", error); return createInternalServerErrorResponse(); }
}
