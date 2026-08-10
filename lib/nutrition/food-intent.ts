import { normalizeFoodQuery } from "./normalization";

/**
 * Conservative food-language bridges used before provider search. They are
 * intentionally names and synonyms, never provider IDs or nutrition data.
 * Keeping this at the candidate-collection boundary makes every smart
 * Nutrition flow (Describe, AI Scan, and future assistants) search the same
 * canonical universe.
 */
const FOOD_INTENT_ALIASES: Record<string, readonly string[]> = {
  "french omelette": ["omelet", "omelette", "egg omelet", "egg"],
  "french-style omelette": ["omelet", "omelette", "egg omelet", "egg"],
  "french style omelette": ["omelet", "omelette", "egg omelet", "egg"],
  omelette: ["omelet", "omelette", "egg omelet", "egg"],
  omelet: ["omelet", "omelette", "egg omelet", "egg"],
  "egg omelette": ["omelet", "omelette", "egg omelet", "egg"],
  "porcini mushroom": ["porcini mushroom", "porcini", "mushroom"],
  porcini: ["porcini mushroom", "porcini", "mushroom"],
  "king bolete": ["porcini mushroom", "porcini", "mushroom"],
  "boletus edulis": ["porcini mushroom", "porcini", "mushroom"],
  manatarka: ["porcini mushroom", "porcini", "mushroom"],
  "манатарка": ["porcini mushroom", "porcini", "mushroom"],
  "cooking butter": ["butter"],
  "unsalted butter": ["butter"],
  "salted butter": ["butter"],
  "bee honey": ["honey"],
  "banana fruit": ["banana"],
  "oat flakes": ["oats", "oatmeal"],
  "rolled oats": ["oats", "oatmeal"],
  "cinnamon powder": ["ground cinnamon", "cinnamon"],
  "ground cinnamon": ["ground cinnamon", "cinnamon"],
  "whole milk": ["whole milk", "milk"],
  "semi skimmed milk": ["milk", "reduced fat milk"],
  mushroom: ["mushroom", "mushrooms"],
  mushrooms: ["mushroom", "mushrooms"],
  "cooked mushroom": ["mushroom", "mushrooms"],
  "cooked mushrooms": ["mushroom", "mushrooms"],
};

export type NutritionFoodIntent = {
  /** The query used for deterministic ranking once synonyms are expanded. */
  rankQuery: string;
  /** Ordered provider/local lookup queries, with the visual label first. */
  searchQueries: string[];
  canonicalName: string;
};

function displayName(value: string) {
  return value ? value.slice(0, 1).toLocaleUpperCase() + value.slice(1) : value;
}

export function nutritionFoodIntent(query: string): NutritionFoodIntent {
  const normalized = normalizeFoodQuery(query);
  const withoutPreparation = normalized.replace(
    /^(?:cooked|raw|fried|boiled|grilled|roasted|sauteed|sautéed|french-style|french style)\s+/,
    ""
  );
  const aliases = FOOD_INTENT_ALIASES[normalized] ?? FOOD_INTENT_ALIASES[withoutPreparation] ?? [];
  const searchQueries = [...new Set([normalized, ...aliases].map(normalizeFoodQuery).filter(Boolean))];
  return {
    rankQuery: aliases[0] ? normalizeFoodQuery(aliases[0]) : normalized,
    searchQueries,
    canonicalName: displayName(aliases[0] ? normalizeFoodQuery(aliases[0]) : normalized),
  };
}
