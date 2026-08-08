import { normalizeBarcode, normalizeFoodQuery } from "./normalization";
import type { ExternalFoodResult, FoodSummary } from "./types";

export type FoodQueryKind = "GENERIC" | "SPECIFIC_VARIANT" | "PRODUCT" | "BARCODE";

const PACKAGE_SIZE = /\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|oz|lb)\b/i;
const PRODUCT_TERMS = ["zero", "diet", "protein bar", "flavour", "flavor", "limited edition", "classic", "sugar free"];
const MODIFIERS = ["raw", "uncooked", "dried", "dehydrated", "canned", "candied", "cooked", "boiled", "baked", "roasted", "grilled", "steamed", "fried", "mashed", "frozen", "sweetened", "juice", "sauce", "puree", "pie", "pudding", "split", "chips", "snack", "baby food", "with sugar", "with salt", "prepared", "restaurant", "fast food", "flour", "powder"];
const VARIETIES = ["granny smith", "fuji", "gala", "honeycrisp", "atlantic", "sockeye"];
const PACKAGE_DESCRIPTION_TERMS = ["box", "blend", "nuggets", "flavoured", "flavored", "packet", "bottle", "can", "bar"];
export const NUTRITION_SEARCH_RESULT_LIMIT = 20;

/**
 * Broad food searches normally describe the food as eaten, rather than its
 * agricultural/raw form. Keep this focused and token based so it stays easy
 * to extend without baking provider-specific food names into the UI.
 */
export const PREPARED_FOOD_INTENTS: Record<string, readonly string[]> = {
  potato: ["cooked", "boiled", "baked", "mashed", "roasted"],
  potatoes: ["cooked", "boiled", "baked", "mashed", "roasted"],
  rice: ["cooked"],
  pasta: ["cooked"],
  chicken: ["cooked", "grilled", "roasted"],
  beef: ["cooked", "grilled", "roasted"],
  pork: ["cooked", "grilled", "roasted"],
  lentil: ["cooked", "boiled"],
  lentils: ["cooked", "boiled"],
  bean: ["cooked", "boiled"],
  beans: ["cooked", "boiled"],
  egg: ["cooked", "boiled", "fried", "scrambled"],
  eggs: ["cooked", "boiled", "fried", "scrambled"],
};
const NATURALLY_RAW_FOODS = new Set(["apple", "apples", "banana", "bananas", "berry", "berries", "avocado", "avocados", "cucumber", "cucumbers", "tomato", "tomatoes", "lettuce"]);
const PREPARATION_TERMS = new Set(["raw", "uncooked", "cooked", "boiled", "baked", "roasted", "grilled", "steamed", "fried", "mashed", "scrambled"]);

export function classifyFoodQuery(query: string): FoodQueryKind {
  const normalized = normalizeFoodQuery(query);
  if (normalizeBarcode(normalized)) return "BARCODE";
  const tokens = normalized.split(" ").filter(Boolean);
  if (PACKAGE_SIZE.test(query) || /["“”]/.test(query) || PRODUCT_TERMS.some((term) => normalized.includes(term)) || tokens.length >= 5) return "PRODUCT";
  if (MODIFIERS.some((term) => normalized.includes(term)) || VARIETIES.some((term) => normalized.includes(term))) return "SPECIFIC_VARIANT";
  return "GENERIC";
}

function tokens(value: string) { return normalizeFoodQuery(value).split(" ").filter(Boolean); }
function usdaDataType(result: ExternalFoodResult) {
  const raw = result.raw;
  return raw && typeof raw === "object" && "dataType" in raw && typeof raw.dataType === "string" ? raw.dataType.toLowerCase() : "";
}
function hasModifier(name: string, modifier: string) { return normalizeFoodQuery(name).includes(modifier); }
function preparationIntent(tokens: string[]) { return tokens.filter((token) => PREPARATION_TERMS.has(token)); }
function preparedFoodIntent(tokens: string[]) {
  for (const token of tokens) if (PREPARED_FOOD_INTENTS[token]) return PREPARED_FOOD_INTENTS[token];
  return null;
}

/** A provider fallback hint only; final ordering always uses scoreFoodResult. */
export function preferredPreparationSearchTerm(query: string) {
  const queryTokens = tokens(query);
  if (preparationIntent(queryTokens).length) return null;
  return preparedFoodIntent(queryTokens)?.[0] ?? null;
}

export function isUsdaGenericFood(result: ExternalFoodResult) {
  if (result.provider !== "USDA") return false;
  const dataType = usdaDataType(result);
  if (dataType.includes("branded") || result.foodType === "BRANDED" || Boolean(result.brandName)) return false;
  return dataType.includes("foundation") || dataType.includes("sr legacy") || dataType.includes("survey") || result.foodType === "GENERIC";
}

export function isPackagedFoodResult(result: ExternalFoodResult) {
  if (result.provider === "OPEN_FOOD_FACTS") return true;
  return !isUsdaGenericFood(result) || PACKAGE_DESCRIPTION_TERMS.some((term) => hasModifier(result.name, term));
}

export function withSearchMetadata(result: ExternalFoodResult): ExternalFoodResult {
  const dataType = usdaDataType(result);
  const isGeneric = isUsdaGenericFood(result);
  return { ...result, searchMetadata: { source: result.provider, isGeneric, isBranded: !isGeneric, usdaDataType: dataType || null } };
}

function tokenMatches(name: string, token: string) {
  return name.split(" ").some((word) => word === token || word === `${token}s` || `${word}s` === token);
}

/** Rejects loose provider matches before they can receive a generic-food score. */
export function isRelevantFoodResult(query: string, result: ExternalFoodResult) {
  const queryTokens = tokens(query);
  const name = normalizeFoodQuery(result.name);
  const brand = normalizeFoodQuery(result.brandName ?? "");
  const coverage = queryTokens.filter((token) => tokenMatches(name, token) || tokenMatches(brand, token)).length;
  if (!queryTokens.length || !coverage) return false;
  if (classifyFoodQuery(query) === "PRODUCT") return coverage >= Math.min(2, queryTokens.length) || name.includes(normalizeFoodQuery(query));
  return coverage === queryTokens.length;
}

export function scoreFoodResult(query: string, result: ExternalFoodResult) {
  const normalizedQuery = normalizeFoodQuery(query);
  const name = normalizeFoodQuery(result.name);
  const queryTokens = tokens(query);
  const kind = classifyFoodQuery(query);
  let score = 0;
  if (name === normalizedQuery) score += 220;
  else if (name.startsWith(`${normalizedQuery} `) || name.startsWith(`${normalizedQuery},`)) score += 150;
  score += queryTokens.filter((token) => name.includes(token)).length * 28;
  score -= Math.max(0, name.length - normalizedQuery.length - 12) * 1.5;

  const dataType = usdaDataType(result);
  const isUsdaGeneric = isUsdaGenericFood(result);
  const isBranded = isPackagedFoodResult(result);
  if (kind === "GENERIC") {
    if (isUsdaGeneric) score += 130;
    if (dataType.includes("foundation")) score += 38;
    else if (dataType.includes("sr legacy")) score += 32;
    else if (dataType.includes("survey")) score += 20;
    const explicitPreparation = preparationIntent(queryTokens);
    const preparedIntent = preparedFoodIntent(queryTokens);
    const isRaw = /(?:^|[ ,])raw(?:$|[ ,])|uncooked/.test(name);
    if (explicitPreparation.length) {
      for (const preparation of explicitPreparation) {
        if (hasModifier(name, preparation)) score += 120;
        else score -= 36;
      }
    } else if (preparedIntent) {
      if (preparedIntent.some((term) => hasModifier(name, term))) score += 105;
      if (isRaw) score -= 78;
    } else if (queryTokens.some((token) => NATURALLY_RAW_FOODS.has(token)) && isRaw) {
      // Raw is the ordinary edible form for fruit and fresh vegetables.
      score += 70;
    } else if (isRaw) {
      score += 18;
    }
    if (isBranded) score -= 170;
    for (const modifier of MODIFIERS) {
      if (!hasModifier(name, modifier) || normalizedQuery.includes(modifier)) continue;
      // A desired everyday preparation should not be punished as a variant.
      if (preparedIntent?.includes(modifier)) continue;
      score -= 52;
    }
    for (const variety of VARIETIES) if (hasModifier(name, variety) && !normalizedQuery.includes(variety)) score -= 24;
  } else if (kind === "PRODUCT") {
    if (result.provider === "OPEN_FOOD_FACTS") score += 70;
    if (isBranded) score += 40;
    if (result.brandName && normalizedQuery.includes(normalizeFoodQuery(result.brandName))) score += 80;
  } else if (kind === "SPECIFIC_VARIANT") {
    if (queryTokens.every((token) => name.includes(token))) score += 70;
    for (const preparation of preparationIntent(queryTokens)) {
      if (hasModifier(name, preparation)) score += 120;
      else score -= 36;
    }
    if (isUsdaGeneric) score += 35;
    if (isBranded) score -= 35;
  }
  return score;
}

/** Applies the API's shared display budget after ranking and source-safe dedupe. */
export function limitFoodSearchResults<T extends { genericResults: unknown[]; localResults: unknown[]; packagedResults: unknown[] }>(results: T, limit = NUTRITION_SEARCH_RESULT_LIMIT) {
  // Preserve a small lower-priority packaged tail so a normal search does not
  // make useful products unreachable whenever the user has many saved foods.
  const packagedReserve = results.packagedResults.length ? Math.min(5, limit) : 0;
  const genericResults = results.genericResults.slice(0, Math.max(0, limit - packagedReserve));
  const remainingAfterGeneric = Math.max(0, limit - genericResults.length);
  const localResults = results.localResults.slice(0, Math.max(0, remainingAfterGeneric - packagedReserve));
  const remainingAfterLocal = Math.max(0, limit - genericResults.length - localResults.length);
  const packagedResults = results.packagedResults.slice(0, remainingAfterLocal);
  return { ...results, genericResults, localResults, packagedResults };
}

/** Picks a real, non-branded USDA generic candidate for ordinary food queries. */
export function selectPrimaryGenericFood(query: string, results: ExternalFoodResult[]) {
  if (classifyFoodQuery(query) !== "GENERIC") return null;
  return [...results]
    .filter((result) => result.provider === "USDA" && result.foodType === "GENERIC" && !result.brandName)
    .sort((left, right) => scoreFoodResult(query, right) - scoreFoodResult(query, left))[0] ?? null;
}

export function rankExternalFoodResults(query: string, results: ExternalFoodResult[]) {
  return [...results].sort((left, right) => {
    const difference = scoreFoodResult(query, right) - scoreFoodResult(query, left);
    if (difference !== 0) return difference;
    return `${left.provider}:${left.externalId}`.localeCompare(`${right.provider}:${right.externalId}`);
  });
}

function nutritionKey(result: ExternalFoodResult) {
  const nutrition = result.nutritionPer100g;
  return [nutrition.caloriesKcal, nutrition.proteinGrams, nutrition.carbohydrateGrams, nutrition.fatGrams]
    .map((value) => typeof value === "number" ? value.toFixed(2) : "-").join(":");
}

/** Removes only exact source records and clearly identical provider previews. */
export function deduplicateExternalFoodResults(local: FoodSummary[], results: ExternalFoodResult[]) {
  const localSources = new Set(local.map((food) => `${food.source}:${food.sourceExternalId}`));
  const localIdentities = new Set(local.map((food) => `${normalizeFoodQuery(food.name)}:${normalizeFoodQuery(food.brandName ?? "")}:${[food.nutritionPer100g.caloriesKcal, food.nutritionPer100g.proteinGrams, food.nutritionPer100g.carbohydrateGrams, food.nutritionPer100g.fatGrams].map((value) => typeof value === "number" ? value.toFixed(2) : "-").join(":")}`));
  const seen = new Set<string>();
  return results.filter((result) => {
    const source = result.provider === "USDA" ? "USDA" : "OPEN_FOOD_FACTS";
    const identity = `${normalizeFoodQuery(result.name)}:${normalizeFoodQuery(result.brandName ?? "")}:${nutritionKey(result)}`;
    if (localSources.has(`${source}:${result.externalId}`) || localIdentities.has(identity)) return false;
    const key = `${source}:${result.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.has(`identity:${identity}`)) return false;
    seen.add(`identity:${identity}`);
    return true;
  });
}
