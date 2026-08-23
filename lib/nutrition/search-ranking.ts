import { normalizeBarcode, normalizeFoodQuery, nutritionFoodQueryVariants } from "./normalization";
import type { ExternalFoodResult, FoodSummary } from "./types";

export type FoodQueryKind = "GENERIC" | "SPECIFIC_VARIANT" | "PRODUCT" | "BARCODE";

const PACKAGE_SIZE = /\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|oz|lb)\b/i;
const PRODUCT_TERMS = ["zero", "diet", "protein bar", "flavour", "flavor", "limited edition", "classic", "sugar free"];
const MODIFIERS = ["raw", "uncooked", "dried", "dehydrated", "canned", "candied", "cooked", "boiled", "baked", "roasted", "grilled", "steamed", "fried", "smoked", "mashed", "frozen", "sweetened", "juice", "sauce", "puree", "pie", "pudding", "split", "chips", "snack", "baby food", "with sugar", "with salt", "prepared", "restaurant", "fast food", "flour", "powder"];
const VARIETIES = ["granny smith", "fuji", "gala", "honeycrisp", "atlantic", "sockeye"];
const PACKAGE_DESCRIPTION_TERMS = ["box", "blend", "nuggets", "flavoured", "flavored", "packet", "bottle", "can", "bar"];
export const NUTRITION_SEARCH_RESULT_LIMIT = 20;
export const NUTRITION_PROVIDER_CANDIDATE_LIMIT = 50;

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
  oat: ["cooked", "oatmeal", "porridge"],
  oats: ["cooked", "oatmeal", "porridge"],
};
const NATURALLY_RAW_FOODS = new Set(["apple", "apples", "banana", "bananas", "berry", "berries", "avocado", "avocados", "cucumber", "cucumbers", "tomato", "tomatoes", "lettuce"]);
const PREPARATION_TERMS = new Set(["raw", "uncooked", "cooked", "boiled", "baked", "roasted", "grilled", "steamed", "fried", "mashed", "scrambled"]);
const DEFAULT_DAIRY_MILK_PREFERENCE: ReadonlyArray<readonly [string, number]> = [
  ["whole", 90],
  ["reduced fat", 70],
  ["lowfat", 50],
  ["skim", 30],
  ["nonfat", 30],
  ["coconut", -100],
  ["almond", -100],
  ["soy", -100],
  ["oat", -100],
];
const GENERIC_INGREDIENT_FORM_INTENTS: Record<string, readonly string[]> = {
  cinnamon: ["ground", "spice"],
  salt: ["table", "iodized", "sea"],
  sugar: ["granulated", "brown", "powdered"],
  flour: ["all purpose", "wheat"],
};
const INGREDIENT_DERIVATIVE_TERMS = ["roll", "dessert", "cake", "cookie", "cereal", "candy", "drink", "shake", "prepared"];

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
function defaultFoodVariantScore(queryTokens: string[], name: string) {
  if (queryTokens.length !== 1 || queryTokens[0] !== "milk") return 0;
  return DEFAULT_DAIRY_MILK_PREFERENCE.reduce(
    (score, [term, adjustment]) => score + (hasModifier(name, term) ? adjustment : 0),
    0,
  );
}
function genericIngredientScore(queryTokens: string[], name: string) {
  if (queryTokens.length !== 1) return 0;
  const forms = GENERIC_INGREDIENT_FORM_INTENTS[queryTokens[0]];
  if (!forms) return 0;
  let score = forms.some((term) => hasModifier(name, term)) ? 115 : 0;
  if (INGREDIENT_DERIVATIVE_TERMS.some((term) => hasModifier(name, term))) score -= 125;
  return score;
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

export function isFineliGenericFood(result: ExternalFoodResult) {
  return result.provider === "FINELI" && result.searchMetadata?.fineliType === "FOOD";
}

export function isPackagedFoodResult(result: ExternalFoodResult) {
  if (result.provider === "OPEN_FOOD_FACTS") return true;
  if (result.provider === "FINELI") return false;
  return !isUsdaGenericFood(result) || PACKAGE_DESCRIPTION_TERMS.some((term) => hasModifier(result.name, term));
}

export function withSearchMetadata(result: ExternalFoodResult): ExternalFoodResult {
  if (result.provider === "FINELI") return result;
  const dataType = usdaDataType(result);
  const isGeneric = isUsdaGenericFood(result);
  return { ...result, searchMetadata: { source: result.provider, isGeneric, isBranded: !isGeneric, usdaDataType: dataType || null } };
}

function tokenMatches(name: string, token: string) {
  const tokenVariants = new Set(nutritionFoodQueryVariants(token));
  return name.split(" ").some((word) =>
    nutritionFoodQueryVariants(word).some((variant) => tokenVariants.has(variant))
  );
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
  const isFineliGeneric = isFineliGenericFood(result);
  const isBranded = isPackagedFoodResult(result);
  if (kind === "GENERIC") {
    if (isUsdaGeneric) score += 130;
    if (isFineliGeneric) score += 210;
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
    score += defaultFoodVariantScore(queryTokens, name);
    score += genericIngredientScore(queryTokens, name);
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

export type NutritionFoodCandidate = {
  id?: string;
  externalId?: string;
  sourceExternalId?: string;
  provider?: "FINELI" | "USDA" | "OPEN_FOOD_FACTS";
  source?: string;
  name: string;
  brandName?: string | null;
  type?: string;
  verificationStatus?: string;
  isLocal?: boolean;
  searchMetadata?: { isGeneric?: boolean; isBranded?: boolean; fineliType?: "FOOD" | "DISH" | null };
};

function candidateProvider(candidate: NutritionFoodCandidate): "FINELI" | "USDA" | "OPEN_FOOD_FACTS" {
  return candidate.provider ?? (candidate.source === "FINELI" ? "FINELI" : candidate.source === "USDA" ? "USDA" : "OPEN_FOOD_FACTS");
}
function candidateIsCommunity(candidate: NutritionFoodCandidate) {
  return candidate.source === "USER" || candidate.type === "USER_CREATED";
}
function candidateIsGeneric(candidate: NutritionFoodCandidate) {
  if (candidate.searchMetadata?.isGeneric !== undefined) return candidate.searchMetadata.isGeneric;
  if (candidateIsCommunity(candidate)) return true;
  if (candidate.type) return candidate.type === "GENERIC";
  return candidateProvider(candidate) === "USDA" || candidateProvider(candidate) === "FINELI";
}
function candidateCoreName(candidate: NutritionFoodCandidate) {
  // USDA commonly expresses ingredient variants as "Milk, whole" and
  // "Cinnamon, ground". Split the provider label before normalization,
  // because normalization intentionally removes punctuation.
  return normalizeFoodQuery(candidate.name.split(",")[0] ?? "");
}
function candidateIdentity(candidate: NutritionFoodCandidate) {
  return `${candidateProvider(candidate)}:${candidate.id ?? candidate.externalId ?? candidate.sourceExternalId ?? candidate.name}`;
}

/** Scores the shared preview universe before any provider record is imported. */
export function scoreNutritionFoodCandidate(query: string, candidate: NutritionFoodCandidate) {
  const normalizedQuery = normalizeFoodQuery(query);
  const kind = classifyFoodQuery(query);
  const name = normalizeFoodQuery(candidate.name);
  const core = candidateCoreName(candidate);
  const generic = candidateIsGeneric(candidate);
  const community = candidateIsCommunity(candidate);
  const branded = !community && (Boolean(candidate.brandName) || candidate.searchMetadata?.isBranded === true || candidateProvider(candidate) === "OPEN_FOOD_FACTS");
  const explicitlyNamesBrand = Boolean(
    candidate.brandName
    && normalizedQuery.includes(normalizeFoodQuery(candidate.brandName))
  );
  let value = 0;
  if (core === normalizedQuery) value += 260;
  else if (name === normalizedQuery) value += 220;
  else if (name.startsWith(`${normalizedQuery},`) || name.startsWith(`${normalizedQuery} `)) value += 150;
  value += tokens(query).filter((token) => tokenMatches(name, token)).length * 32;
  if (generic) value += 155;
  if (candidateProvider(candidate) === "USDA") value += 45;
  // Synced Fineli records are local FoodSummary objects and intentionally no
  // longer carry transient provider search metadata. FINELI + GENERIC is the
  // persisted equivalent of a Fineli FOOD record.
  if (candidateProvider(candidate) === "FINELI" && candidateIsGeneric(candidate)) value += 170;
  if (candidate.isLocal) value += 90;
  if (explicitlyNamesBrand) value += 360;
  // Community contributions are immediately useful to their creator, but an
  // unverified one must not outrank an equally exact trusted provider record.
  if (community && candidate.verificationStatus === "UNVERIFIED") value -= 75;
  value += defaultFoodVariantScore(tokens(query), name);
  value += genericIngredientScore(tokens(query), name);
  const preparedIntent = preparedFoodIntent(tokens(query));
  const explicitPreparation = preparationIntent(tokens(query));
  const raw = /(?:^|[ ,])raw(?:$|[ ,])|uncooked/.test(name);
  if (explicitPreparation.length) for (const preparation of explicitPreparation) value += hasModifier(name, preparation) ? 130 : -45;
  else if (preparedIntent) {
    if (preparedIntent.some((term) => hasModifier(name, term))) value += 140;
    if (raw) value -= 130;
  } else if (tokens(query).some((token) => NATURALLY_RAW_FOODS.has(token)) && raw) value += 72;
  for (const modifier of MODIFIERS) if (hasModifier(name, modifier) && !normalizedQuery.includes(modifier) && !preparedIntent?.includes(modifier)) value -= 58;
  if (kind === "GENERIC" && branded && !explicitlyNamesBrand) value -= 280;
  value -= Math.max(0, name.length - normalizedQuery.length - 10) * 1.7;
  return value;
}

/**
 * The common ordered list for Food UI, Describe, AI Scan, and meal templates.
 * It intentionally consumes only preview metadata so candidates are ranked
 * before an external provider record is imported.
 */
export function rankNutritionFoodCandidates<T extends NutritionFoodCandidate>(query: string, candidates: readonly T[]) {
  return [...candidates].sort((left, right) => {
    const difference = scoreNutritionFoodCandidate(query, right) - scoreNutritionFoodCandidate(query, left);
    return difference || candidateIdentity(left).localeCompare(candidateIdentity(right));
  });
}

/**
 * Keeps a capped result list useful by avoiding a run of near-identical
 * provider variants while retaining every distinct candidate in the source
 * pool for later ranking and automatic resolution.
 */
export function diversifyNutritionFoodCandidates<T extends NutritionFoodCandidate>(candidates: readonly T[], maxPerCore = 4) {
  const seenByCore = new Map<string, number>();
  return candidates.filter((candidate) => {
    const core = candidateCoreName(candidate);
    const count = seenByCore.get(core) ?? 0;
    if (count >= maxPerCore) return false;
    seenByCore.set(core, count + 1);
    return true;
  });
}

/** Whether one candidate is safe to use as a local-first automatic match. */
export function isSufficientNutritionFoodCandidate(query: string, candidate: NutritionFoodCandidate) {
  const kind = classifyFoodQuery(query);
  const name = normalizeFoodQuery(candidate.name);
  const brand = normalizeFoodQuery(candidate.brandName ?? "");
  const queryTokens = tokens(query);
  const tokenCoverage = queryTokens.filter((token) =>
    tokenMatches(name, token) || tokenMatches(brand, token)
  ).length;
  if (kind === "SPECIFIC_VARIANT") return tokenCoverage === queryTokens.length;
  if (kind === "PRODUCT") return tokenCoverage >= Math.min(2, queryTokens.length);
  if (kind === "BARCODE") return true;
  const explicitProductIntent = queryTokens.length >= 2 && queryTokens.filter((token) => tokenMatches(name, token) || tokenMatches(normalizeFoodQuery(candidate.brandName ?? ""), token)).length >= 2;
  const strongConceptMatch = queryTokens.every((token) => tokenMatches(name, token))
    || Boolean(preparedFoodIntent(queryTokens)?.some((term) => hasModifier(name, term)));
  const derivativeOnly = ["nectar", "juice", "candy", "sweet", "soda", "drink", "pudding", "split", "chips", "flavored", "flavoured"].some((term) => hasModifier(name, term));
  const plantMilkForPlainMilk = queryTokens.length === 1
    && queryTokens[0] === "milk"
    && ["coconut", "almond", "soy", "oat"].some((term) => hasModifier(name, term));
  return (candidateIsGeneric(candidate) || explicitProductIntent)
    && (strongConceptMatch || explicitProductIntent)
    && (!derivativeOnly || candidateCoreName(candidate) === normalizeFoodQuery(query) || explicitProductIntent)
    && (!plantMilkForPlainMilk || explicitProductIntent);
}

/** Reject brand/derivative-only matches instead of silently logging them. */
export function selectNutritionFoodCandidate<T extends NutritionFoodCandidate>(query: string, candidates: readonly T[]) {
  // Search the ranked universe, rather than treating one bad derivative at
  // the top as proof that no valid food exists farther down the provider set.
  return rankNutritionFoodCandidates(query, candidates).find((candidate) =>
    isSufficientNutritionFoodCandidate(query, candidate)
  ) ?? null;
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
    const source = result.provider;
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
