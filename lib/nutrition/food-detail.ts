import type { ExternalFoodResult, NutritionValues } from "./types";

const primaryNutritionKeys = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams"] as const;

function numberValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function serializeNutrition(values: Record<string, unknown>): NutritionValues {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    const parsed = numberValue(value);
    return parsed === undefined ? [] : [[key, parsed]];
  })) as NutritionValues;
}

export function foodCompleteness(values: NutritionValues) {
  const count = primaryNutritionKeys.filter((key) => values[key] !== undefined).length;
  return count === primaryNutritionKeys.length ? "COMPLETE" : count > 0 ? "PARTIAL" : "INCOMPLETE";
}

function sourceLabel(source: string) {
  if (source === "USDA") return "USDA FoodData Central data";
  if (source === "OPEN_FOOD_FACTS") return "Open Food Facts Community Data";
  if (source === "CALISTHENI") return "Calistheni verified data";
  return "Food data";
}

function sourceFrom(result: ExternalFoodResult) {
  const nutrition = result.nutritionPer100g;
  return {
    provider: result.provider,
    label: sourceLabel(result.provider),
    verificationStatus: result.verificationStatus,
    confidenceScore: result.confidenceScore,
    completeness: foodCompleteness(nutrition),
    freshnessStatus: "NOT_SAVED",
    sourceUpdatedAt: result.sourceUpdatedAt?.toISOString() ?? null,
    lastRevalidatedAt: null,
    nextRevalidateAt: null,
  };
}

export function externalFoodDetail(result: ExternalFoodResult) {
  const details = result.details;
  return {
    kind: "EXTERNAL" as const,
    food: {
      externalId: result.externalId,
      name: result.name,
      brandName: result.brandName ?? null,
      barcode: result.barcode ?? null,
      type: result.foodType,
      images: { front: details?.productImageUrl ?? result.imageUrl ?? null, nutrition: details?.nutritionImageUrl ?? null, ingredients: details?.ingredientsImageUrl ?? null },
      package: { quantityText: details?.packageQuantityText ?? null, quantityGrams: details?.packageQuantityGrams ?? null },
      servings: result.servings.map((serving) => ({ ...serving, id: `${result.provider}:${result.externalId}:${serving.name}` })),
      nutritionPer100g: result.nutritionPer100g,
      ingredients: { text: details?.ingredientsText ?? null, allergens: details?.allergens ?? [], traces: details?.traces ?? [], additives: details?.additives ?? [] },
      classifications: { nutriScoreGrade: details?.nutriScoreGrade ?? null, novaGroup: details?.novaGroup ?? null, nutrientLevels: details?.nutrientLevels ?? null, veganStatus: details?.veganStatus ?? null, vegetarianStatus: details?.vegetarianStatus ?? null, palmOilStatus: details?.palmOilStatus ?? null },
      categories: details?.categories ?? [], labels: details?.labels ?? [], countriesSold: result.countryCodes,
      nutrients: details?.nutrients ?? [], source: sourceFrom(result), currentRevision: null,
    },
  };
}

export function localFoodDetail(food: Record<string, unknown>) {
  const nutrition = serializeNutrition(food);
  const details = (food.details ?? null) as Record<string, unknown> | null;
  return {
    kind: "LOCAL" as const,
    food: {
      id: String(food.id), name: String(food.name), brandName: food.brandName ?? null, barcode: food.barcode ?? null, type: String(food.type),
      images: { front: details?.productImageUrl ?? food.imageUrl ?? null, nutrition: details?.nutritionImageUrl ?? null, ingredients: details?.ingredientsImageUrl ?? null },
      package: { quantityText: details?.packageQuantityText ?? null, quantityGrams: numberValue(details?.packageQuantityGrams) ?? null },
      servings: ((food.servings ?? []) as Record<string, unknown>[]).map((serving) => ({ id: String(serving.id), name: String(serving.name), quantity: numberValue(serving.quantity) ?? 1, grams: numberValue(serving.grams) ?? 0, householdUnit: serving.householdUnit ?? null, isDefault: Boolean(serving.isDefault) })),
      nutritionPer100g: nutrition,
      ingredients: { text: details?.ingredientsText ?? null, allergens: details?.allergens ?? [], traces: details?.traces ?? [], additives: details?.additives ?? [] },
      classifications: { nutriScoreGrade: details?.nutriScoreGrade ?? null, novaGroup: details?.novaGroup ?? null, nutrientLevels: details?.nutrientLevels ?? null, veganStatus: details?.veganStatus ?? null, vegetarianStatus: details?.vegetarianStatus ?? null, palmOilStatus: details?.palmOilStatus ?? null },
      categories: details?.categories ?? [], labels: details?.labels ?? [], countriesSold: food.countryCodes ?? [],
      nutrients: ((food.nutrients ?? []) as Record<string, unknown>[]).map((nutrient) => ({ nutrientKey: String(nutrient.nutrientKey), displayName: String(nutrient.displayName), amount: numberValue(nutrient.amount) ?? 0, unit: String(nutrient.unit) })),
      source: { provider: String(food.source), label: sourceLabel(String(food.source)), verificationStatus: String(food.verificationStatus), confidenceScore: numberValue(food.confidenceScore) ?? 0, completeness: foodCompleteness(nutrition), freshnessStatus: String(food.freshnessStatus), sourceUpdatedAt: food.sourceUpdatedAt instanceof Date ? food.sourceUpdatedAt.toISOString() : null, lastRevalidatedAt: food.lastRevalidatedAt instanceof Date ? food.lastRevalidatedAt.toISOString() : null, nextRevalidateAt: food.nextRevalidateAt instanceof Date ? food.nextRevalidateAt.toISOString() : null },
      currentRevision: food.currentRevision ? { id: String((food.currentRevision as Record<string, unknown>).id), revisionNumber: Number((food.currentRevision as Record<string, unknown>).revisionNumber) } : null,
    },
  };
}
