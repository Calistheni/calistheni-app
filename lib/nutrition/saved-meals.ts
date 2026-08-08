import { snapshotForFood } from "@/lib/nutrition/log";
import { toFoodSummary } from "@/lib/nutrition/service";

const nutrientFields = [
  "caloriesKcal",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "sodiumMg",
  "saltGrams",
] as const;

function numericNutrients(revision: Record<string, unknown>) {
  return Object.fromEntries(
    nutrientFields.map((field) => [
      field,
      revision[field] == null ? undefined : Number(revision[field]),
    ])
  ) as Record<(typeof nutrientFields)[number], number | undefined>;
}

export function serializeSavedMealItem(item: {
  id: string;
  foodId: string;
  foodRevisionId: string;
  grams: unknown;
  quantity: unknown;
  unit: string;
  food: Record<string, unknown>;
  foodRevision: Record<string, unknown>;
}) {
  const food = toFoodSummary(item.food);
  return {
    id: item.id,
    foodId: item.foodId,
    foodRevisionId: item.foodRevisionId,
    grams: Number(item.grams),
    quantity: Number(item.quantity),
    unit: item.unit,
    food: {
      ...food,
      name: String(item.foodRevision.name),
      brandName: item.foodRevision.brandName
        ? String(item.foodRevision.brandName)
        : food.brandName,
      nutritionPer100g: numericNutrients(item.foodRevision),
    },
  };
}

export function serializeSavedMeal(meal: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<Parameters<typeof serializeSavedMealItem>[0]>;
}) {
  return {
    id: meal.id,
    name: meal.name,
    createdAt: meal.createdAt.toISOString(),
    updatedAt: meal.updatedAt.toISOString(),
    items: meal.items.map(serializeSavedMealItem),
  };
}

export function nutritionEntryDataForSavedMealItem(
  item: {
    foodId: string;
    foodRevisionId: string;
    grams: unknown;
    quantity: unknown;
    unit: string;
    foodRevision: Record<string, unknown>;
  },
  gramsConsumed = Number(item.grams) * Number(item.quantity)
) {
  const revision = item.foodRevision;
  const snapshot = snapshotForFood(numericNutrients(revision), gramsConsumed);
  return {
    foodId: item.foodId,
    foodRevisionId: item.foodRevisionId,
    foodNameSnapshot: String(revision.name),
    brandNameSnapshot: revision.brandName ? String(revision.brandName) : null,
    barcodeSnapshot: revision.barcode ? String(revision.barcode) : null,
    gramsConsumed,
    quantity: Number(item.quantity),
    unit: item.unit,
    nutritionBasisGramsSnapshot: Number(revision.nutritionBasisGrams),
    sourceSnapshot: revision.source as never,
    sourceExternalIdSnapshot: String(revision.sourceExternalId),
    ...Object.fromEntries(
      nutrientFields.map((field) => [`${field}Snapshot`, snapshot[field] ?? null])
    ),
  };
}
