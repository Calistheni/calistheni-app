import { createHash } from "node:crypto";
import type { ExternalFoodResult, NutritionValues } from "./types";

const nutrients = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "transFatGrams", "addedSugarGrams", "sodiumMg", "saltGrams", "cholesterolMg", "potassiumMg", "calciumMg", "ironMg"] as const;
/** Keep Unicode for display/language matching, but make search accent-insensitive. */
export function normalizeFoodQuery(value: string) { return value.normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFKC").trim().toLocaleLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}\s'\-]/gu, " ").replace(/\s+/g, " "); }
/**
 * Conservative singular/plural equivalents for canonical food lookup.
 * This is deliberately not general stemming: it only helps the common
 * grocery forms that should share one local search result.
 */
export function nutritionFoodQueryVariants(value: string) {
  const normalized = normalizeFoodQuery(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const words = normalized.split(" ");
  const last = words.at(-1) ?? "";
  let singular: string | null = null;
  if (last.endsWith("ies") && last.length > 3) singular = `${last.slice(0, -3)}y`;
  else if (last.endsWith("oes") && last.length > 3) singular = last.slice(0, -2);
  else if (last.endsWith("es") && last.length > 3) singular = last.slice(0, -2);
  else if (last.endsWith("s") && !last.endsWith("ss") && last.length > 2) singular = last.slice(0, -1);
  if (singular) variants.add([...words.slice(0, -1), singular].join(" "));
  return [...variants];
}
export function normalizeBarcode(value: string) { return /^\d{8,14}$/.test(value) ? value : null; }
export function validNutritionValue(value: unknown, maximum: number) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? value : undefined; }
export function validateNutrition(values: NutritionValues): NutritionValues {
  const output: NutritionValues = {};
  for (const nutrient of nutrients) { const value = validNutritionValue(values[nutrient], nutrient === "sodiumMg" ? 100000 : 10000); if (value !== undefined) output[nutrient] = Math.round(value * 1000) / 1000; }
  return output;
}
export function checksumExternalFood(food: Omit<ExternalFoodResult, "checksum" | "raw">) {
  const canonical = { provider: food.provider, externalId: food.externalId, foodType: food.foodType, name: normalizeFoodQuery(food.name), brandName: food.brandName ? normalizeFoodQuery(food.brandName) : null, barcode: food.barcode ?? null, nutrition: validateNutrition(food.nutritionPer100g), servings: food.servings.map((serving) => ({ name: normalizeFoodQuery(serving.name), quantity: serving.quantity, grams: serving.grams })).sort((a, b) => a.name.localeCompare(b.name)) };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
export function withChecksum(food: Omit<ExternalFoodResult, "checksum">): ExternalFoodResult { return { ...food, checksum: checksumExternalFood(food) }; }
export function isMaterialFoodChange(current: NutritionValues & { name?: string | null; brandName?: string | null; barcode?: string | null }, incoming: NutritionValues & { name?: string | null; brandName?: string | null; barcode?: string | null }) {
  if (current.name !== incoming.name || current.brandName !== incoming.brandName || current.barcode !== incoming.barcode) return true;
  return nutrients.some((nutrient) => { const before = current[nutrient]; const after = incoming[nutrient]; if (before === undefined || before === null || after === undefined || after === null) return before !== after; return Math.abs(before - after) > 0.05; });
}
