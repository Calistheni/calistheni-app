type FoodResultPresentation = {
  isLocal?: boolean;
  provider?: "USDA" | "OPEN_FOOD_FACTS";
  foodType?: "GENERIC" | "BRANDED";
  brandName?: string | null;
  searchMetadata?: { isBranded: boolean };
};

const PLACEHOLDER_BRANDS = new Set([
  "not a branded item",
  "n/a",
  "na",
  "unknown",
  "generic",
]);

function normalizedDisplayText(value: string) {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, " ");
}

/** Returns a real brand suitable for display, never a provider placeholder. */
export function meaningfulFoodBrand(brandName: string | null | undefined, foodName?: string | null) {
  const value = brandName?.trim();
  if (!value) return null;
  const normalizedBrand = normalizedDisplayText(value);
  if (PLACEHOLDER_BRANDS.has(normalizedBrand)) return null;
  if (foodName && normalizedBrand === normalizedDisplayText(foodName)) return null;
  return value;
}

/** User-facing classification only; provider identity remains available in result metadata. */
export function foodResultClassification(food: FoodResultPresentation) {
  if (food.isLocal) return "Saved food";
  if (food.provider === "OPEN_FOOD_FACTS") return "Packaged product";
  if (food.provider === "USDA") {
    if (food.searchMetadata) return food.searchMetadata.isBranded ? "Packaged product" : "Generic food";
    return food.foodType === "BRANDED" || Boolean(meaningfulFoodBrand(food.brandName)) ? "Packaged product" : "Generic food";
  }
  return "Food result";
}
