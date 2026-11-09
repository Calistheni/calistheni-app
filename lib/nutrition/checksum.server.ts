import { createHash } from "node:crypto";
import type { ExternalFoodResult } from "./types";
import { normalizeFoodQuery, validateNutrition } from "./normalization";

/**
 * Canonical provider-data checksum. Keep this in a server-only module because
 * its cryptographic implementation uses Node.js and browser utilities import
 * normalization/search-ranking directly.
 */
export function checksumExternalFood(food: Omit<ExternalFoodResult, "checksum" | "raw">) {
  const canonical = {
    provider: food.provider,
    externalId: food.externalId,
    foodType: food.foodType,
    name: normalizeFoodQuery(food.name),
    brandName: food.brandName ? normalizeFoodQuery(food.brandName) : null,
    barcode: food.barcode ?? null,
    nutrition: validateNutrition(food.nutritionPer100g),
    servings: food.servings
      .map((serving) => ({
        name: normalizeFoodQuery(serving.name),
        quantity: serving.quantity,
        grams: serving.grams,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function withChecksum(food: Omit<ExternalFoodResult, "checksum">): ExternalFoodResult {
  return { ...food, checksum: checksumExternalFood(food) };
}
