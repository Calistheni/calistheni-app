export type FoodUsePreview = {
  id?: string;
  provider?: "FINELI" | "USDA" | "OPEN_FOOD_FACTS";
  externalId: string;
  isLocal?: boolean;
  servings?: Array<{ name: string; grams: number; isDefault?: boolean }>;
};

function responseError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || !("error" in data)) return fallback;
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

/** Uses persisted default servings first; 100 g is the established Nutrition fallback. */
export function defaultFoodUseAmount(food: FoodUsePreview) {
  const serving = food.servings?.find((candidate) => candidate.isDefault && candidate.grams > 0)
    ?? food.servings?.find((candidate) => candidate.grams > 0);
  return serving
    ? { grams: serving.grams, unit: serving.name }
    : { grams: 100, unit: "g" };
}

/** Resolves an external preview only when the user explicitly uses it. */
export async function resolveFoodForUse(food: FoodUsePreview) {
  if (food.isLocal && food.id) return { foodId: food.id, imported: false };
  if (!food.provider) throw new Error("This food cannot be used yet.");

  const response = await fetch("/api/nutrition/foods/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: food.provider, externalId: food.externalId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseError(data, "Unable to save this food."));
  if (!data?.food?.id || typeof data.food.id !== "string") {
    throw new Error("The imported food could not be used.");
  }
  return { foodId: data.food.id, imported: true };
}
