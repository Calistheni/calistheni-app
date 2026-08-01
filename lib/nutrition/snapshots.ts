import type { NutritionValues } from "./types";
export function calculateNutritionSnapshot(values: NutritionValues, gramsConsumed: number, basisGrams = 100): NutritionValues {
  if (!Number.isFinite(gramsConsumed) || gramsConsumed <= 0 || !Number.isFinite(basisGrams) || basisGrams <= 0) throw new Error("Invalid consumed quantity.");
  const multiplier = gramsConsumed / basisGrams;
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => typeof value === "number" ? [[key, Math.round(value * multiplier * 1000) / 1000]] : [])) as NutritionValues;
}
