import { FoodDataValueSource, FoodFreshnessStatus, FoodImportStatus, FoodRevisionReason, FoodSource, FoodType, FoodVerificationStatus, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isMaterialFoodChange, normalizeFoodQuery, nutritionFoodQueryVariants } from "./normalization";
import { nutritionFoodIntent } from "./food-intent";
import {
  isCanonicalAiMealFoodCandidate,
  rankAiMealFoodCandidates,
  selectAiMealFoodCandidate,
} from "./ai-meal-food-matching";
import { nutritionFoodVisibilityWhere } from "./food-visibility";
import { getOpenFoodFactsProduct, searchOpenFoodFactsFoods } from "./providers/open-food-facts";
import { ProviderError } from "./providers/http";
import { getUsdaFood, searchUsdaFoods } from "./providers/usda";
import { resolveFoodIcon } from "./food-icons";
import { buildProviderFoodAliasCandidates } from "./provider-food-aliases";
import { eligibleRemoteFoodProviders, localFoodSearchSufficiency, searchEligibleRemoteFoodProviders } from "./provider-capabilities";
import type { ExternalFoodResult, FoodSearchResponse, FoodSummary, NutritionValues, ProviderState } from "./types";
import { classifyFoodQuery, deduplicateExternalFoodResults, diversifyNutritionFoodCandidates, isPackagedFoodResult, isRelevantFoodResult, isRelevantNutritionFoodCandidate, isUsdaGenericFood, limitFoodSearchResults, NUTRITION_PROVIDER_CANDIDATE_LIMIT, NUTRITION_SEARCH_RESULT_LIMIT, rankExternalFoodResults, rankNutritionFoodCandidates, selectNutritionFoodCandidate, selectPrimaryGenericFood, withSearchMetadata } from "./search-ranking";

const providerFor = (provider: ExternalFoodResult["provider"]) => provider === "FINELI" ? FoodSource.FINELI : provider === "USDA" ? FoodSource.USDA : FoodSource.OPEN_FOOD_FACTS;
const daysFor = (food: { source: FoodSource; type: FoodType; importStatus: FoodImportStatus }) => food.importStatus === FoodImportStatus.INCOMPLETE ? 7 : food.source === FoodSource.OPEN_FOOD_FACTS ? Number(process.env.OPEN_FOOD_FACTS_REVALIDATE_DAYS ?? 30) : food.source === FoodSource.FINELI ? Number(process.env.FINELI_REVALIDATE_DAYS ?? 180) : food.type === FoodType.BRANDED ? 60 : Number(process.env.USDA_REVALIDATE_DAYS ?? 180);
const nextDate = (food: { source: FoodSource; type: FoodType; importStatus: FoodImportStatus }, from = new Date()) => new Date(from.getTime() + daysFor(food) * 86400000);
const numeric = (value: unknown) => value === null || value === undefined ? undefined : Number(value);
function nutritionFromRecord(food: Record<string, unknown>): NutritionValues { return { caloriesKcal: numeric(food.caloriesKcal), proteinGrams: numeric(food.proteinGrams), carbohydrateGrams: numeric(food.carbohydrateGrams), fatGrams: numeric(food.fatGrams), fiberGrams: numeric(food.fiberGrams), sugarGrams: numeric(food.sugarGrams), saturatedFatGrams: numeric(food.saturatedFatGrams), transFatGrams: numeric(food.transFatGrams), addedSugarGrams: numeric(food.addedSugarGrams), sodiumMg: numeric(food.sodiumMg), saltGrams: numeric(food.saltGrams), cholesterolMg: numeric(food.cholesterolMg), potassiumMg: numeric(food.potassiumMg), calciumMg: numeric(food.calciumMg), ironMg: numeric(food.ironMg) }; }
function aliasesFromRecord(food: Record<string, unknown>) {
  return Array.isArray(food.aliases)
    ? food.aliases.flatMap((alias) => alias && typeof alias === "object" && "name" in alias && typeof alias.name === "string" ? [alias.name] : [])
    : [];
}
function localizedNamesFromRecord(food: Record<string, unknown>) {
  return Array.isArray(food.aliases)
    ? food.aliases.flatMap((alias) => {
        if (!alias || typeof alias !== "object" || !("name" in alias) || typeof alias.name !== "string") return [];
        return [{
          name: alias.name,
          languageCode:
            "languageCode" in alias && typeof alias.languageCode === "string"
              ? alias.languageCode
              : undefined,
        }];
      })
    : [];
}
function categoriesFromRecord(food: Record<string, unknown>) {
  const details = food.details;
  return details && typeof details === "object" && "categories" in details && Array.isArray(details.categories)
    ? details.categories.filter((category): category is string => typeof category === "string")
    : [];
}
function productImageFromRecord(food: Record<string, unknown>) {
  if (typeof food.imageUrl === "string" && food.imageUrl) return food.imageUrl;
  const details = food.details;
  return details && typeof details === "object" && "productImageUrl" in details && typeof details.productImageUrl === "string"
    ? details.productImageUrl
    : null;
}
function servingsFromRecord(food: Record<string, unknown>) {
  if (!Array.isArray(food.servings)) return undefined;
  return food.servings.flatMap((serving) => {
    if (!serving || typeof serving !== "object" || !("name" in serving) || !("grams" in serving)) return [];
    const name = String(serving.name);
    const grams = Number(serving.grams);
    const quantity = "quantity" in serving ? Number(serving.quantity) : 1;
    if (!name || !Number.isFinite(grams) || grams <= 0 || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ name, grams, quantity, householdUnit: "householdUnit" in serving && serving.householdUnit ? String(serving.householdUnit) : null, isDefault: "isDefault" in serving && Boolean(serving.isDefault) }];
  });
}
function foodIconReference(food: Record<string, unknown>) {
  const icon = resolveFoodIcon({ name: String(food.name), aliases: aliasesFromRecord(food), categories: categoriesFromRecord(food), imageUrl: productImageFromRecord(food), iconKey: typeof food.iconKey === "string" ? food.iconKey : null, type: typeof food.type === "string" ? food.type : null, source: typeof food.source === "string" ? food.source : null });
  return icon ? { key: icon.key, url: icon.url, match: icon.match } : undefined;
}
export function withResolvedFoodIcon(result: ExternalFoodResult): ExternalFoodResult {
  const icon = resolveFoodIcon({ name: result.name, categories: result.details?.categories, imageUrl: result.imageUrl, type: result.foodType, source: result.provider });
  return icon ? { ...result, genericIcon: { key: icon.key, url: icon.url, match: icon.match } } : result;
}
function debugFoodCandidate(candidate: FoodSummary | ExternalFoodResult | null) {
  if (!candidate) return null;
  return {
    name: candidate.name,
    provider: "provider" in candidate ? candidate.provider : candidate.source,
    providerId: "externalId" in candidate ? candidate.externalId : candidate.sourceExternalId,
    providerType: "searchMetadata" in candidate
      ? candidate.searchMetadata?.fineliType ?? null
      : null,
  };
}
export function toFoodSummary(food: Record<string, unknown>): FoodSummary {
  const next = food.nextRevalidateAt instanceof Date ? food.nextRevalidateAt : null;
  const summary: FoodSummary = { id: String(food.id), name: String(food.name), brandName: food.brandName ? String(food.brandName) : null, barcode: food.barcode ? String(food.barcode) : null, imageUrl: productImageFromRecord(food), genericIcon: foodIconReference(food), servings: servingsFromRecord(food), type: String(food.type), source: String(food.source), sourceExternalId: String(food.sourceExternalId), verificationStatus: String(food.verificationStatus), contributionStatus: typeof food.contributionStatus === "string" ? food.contributionStatus : null, freshnessStatus: String(food.freshnessStatus), confidenceScore: Number(food.confidenceScore), nutritionPer100g: nutritionFromRecord(food), importedAt: (food.importedAt as Date).toISOString(), lastRevalidatedAt: food.lastRevalidatedAt ? (food.lastRevalidatedAt as Date).toISOString() : null, nextRevalidateAt: next?.toISOString() ?? null, currentRevisionId: food.currentRevisionId ? String(food.currentRevisionId) : null, isLocal: true, revalidationRecommended: !next || next <= new Date() };
  // Search aliases participate in server-side ranking but do not alter the
  // established public FoodSummary response shape.
  Object.defineProperty(summary, "localizedNames", {
    value: localizedNamesFromRecord(food),
    enumerable: false,
  });
  return summary;
}
async function findLocalFoodCandidates(normalized: string, userId?: string) {
  const terms = nutritionFoodQueryVariants(normalized);
  const fieldsContaining = (variants: string[]): Prisma.FoodWhereInput => ({
    OR: variants.flatMap((term) => [
      { normalizedName: { contains: term } },
      { name: { contains: term, mode: "insensitive" as const } },
      { brandName: { contains: term, mode: "insensitive" as const } },
      { aliases: { some: { normalizedName: { contains: term } } } },
    ]),
  });
  const tokenGroups = normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => fieldsContaining(nutritionFoodQueryVariants(token)));
  const localFoods = await prisma.food.findMany({
    where: {
      AND: [
        ...(userId ? [nutritionFoodVisibilityWhere(userId)] : [{ type: { not: FoodType.USER_CREATED } }]),
        { OR: [fieldsContaining(terms), { AND: tokenGroups }] },
      ],
    },
    include: {
      aliases: { select: { name: true, languageCode: true } },
      details: { select: { categories: true, productImageUrl: true } },
      servings: { select: { name: true, quantity: true, grams: true, householdUnit: true, isDefault: true } },
    },
    orderBy: [{ selectionCount: "desc" }, { updatedAt: "desc" }],
    // Provider datasets contain many variants for staples such as potato,
    // rice, egg, and chicken. Ranking must see the clean canonical entries;
    // truncating at 60 before relevance scoring made insertion/usage order
    // choose the winner. Only the ranked top-N leaves this server function.
    take: 250,
  });
  const foods = localFoods
    .map((food) => toFoodSummary(food))
    .filter((food) => isRelevantNutritionFoodCandidate(normalized, food));
  return { foods, rawCount: localFoods.length };
}

async function findLocalFoods(normalized: string, userId?: string) {
  return (await findLocalFoodCandidates(normalized, userId)).foods;
}

/** Local canonical candidates used before any Describe/AI provider fallback. */
export async function searchLocalFoods(query: string, userId?: string) {
  const normalized = normalizeFoodQuery(query);
  return rankNutritionFoodCandidates(normalized, await findLocalFoods(normalized, userId));
}

/** Shared top-N canonical preview set for smart Nutrition workflows. */
export async function getNutritionCandidatesForIntent(query: string, limit = 5, userId?: string, options?: { aiMealPhoto?: boolean }) {
  const intent = nutritionFoodIntent(query);
  if (process.env.NODE_ENV === "development") {
    console.info("[Nutrition candidate resolver] search queries", {
      input: query,
      rankQuery: intent.rankQuery,
      queries: intent.searchQueries,
    });
  }
  // AI Scan and Describe should reuse an existing visible canonical food
  // without waiting for provider searches. Alias and moderation semantics are
  // already part of searchLocalFoods; provider collection remains the fallback
  // when the local pool has no safe match.
  const localSearches = await Promise.all(
    intent.searchQueries.map((intentQuery) => searchLocalFoods(intentQuery, userId))
  );
  const seenLocal = new Set<string>();
  const uniqueLocalCandidates = localSearches.flat().filter((candidate) => {
      if (seenLocal.has(candidate.id)) return false;
      seenLocal.add(candidate.id);
      return true;
    });
  const localCandidates = options?.aiMealPhoto
    ? rankAiMealFoodCandidates(query, intent.rankQuery, uniqueLocalCandidates)
    : rankNutritionFoodCandidates(intent.rankQuery, uniqueLocalCandidates);
  const localMatch = options?.aiMealPhoto
    ? selectAiMealFoodCandidate(query, intent.rankQuery, localCandidates)
    : selectNutritionFoodCandidate(intent.rankQuery, localCandidates);
  const acceptsLocalMatch = Boolean(localMatch && (!options?.aiMealPhoto || isCanonicalAiMealFoodCandidate(query, intent.rankQuery, localMatch)));
  if (process.env.NODE_ENV === "development" && options?.aiMealPhoto) {
    console.info(`[AI Food Resolve] local candidates=${JSON.stringify({
      detected: query,
      candidates: localCandidates.map(debugFoodCandidate),
      selected: debugFoodCandidate(localMatch),
      acceptedAsGeneric: acceptsLocalMatch,
    })}`);
  }
  if (localMatch && acceptsLocalMatch) {
    return localCandidates.slice(0, Math.max(1, Math.min(limit, 8)));
  }
  if (options?.aiMealPhoto && process.env.NODE_ENV === "development") {
    const fineliCount = localCandidates.filter((candidate) => candidate.source === "FINELI").length;
    if (!fineliCount) console.warn("[AI Food Resolve] no local Fineli candidates; run npm run nutrition:sync-fineli before relying on USDA fallback");
    else console.info(`[AI Food Resolve] local Fineli candidates=${fineliCount}`);
  }
  const results = await Promise.all(intent.searchQueries.map((intentQuery) => searchFoods(intentQuery, userId)));
  const seen = new Set<string>();
  const candidates = results.flatMap((result) => result.results).filter((candidate) => {
    const identity = "id" in candidate
      ? `${candidate.source}:${candidate.id}`
      : `${candidate.provider}:${candidate.externalId}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  if (process.env.NODE_ENV === "development" && options?.aiMealPhoto) {
    console.info(`[AI Food Resolve] fallback=${JSON.stringify({
      detected: query,
      candidates: candidates.map(debugFoodCandidate),
    })}`);
  }
  return (options?.aiMealPhoto
    ? rankAiMealFoodCandidates(query, intent.rankQuery, candidates)
    : rankNutritionFoodCandidates(intent.rankQuery, candidates))
    .slice(0, Math.max(1, Math.min(limit, 8)));
}

export async function searchFoods(query: string, userId?: string): Promise<FoodSearchResponse> {
  const normalized = normalizeFoodQuery(query);
  const intent = nutritionFoodIntent(normalized);
  const queryKind = classifyFoodQuery(normalized);
  const providerQueries = intent.searchQueries.slice(0, 3);
  const local = await findLocalFoodCandidates(normalized, userId).then(
    (value): PromiseSettledResult<{ foods: FoodSummary[]; rawCount: number }> => ({ status: "fulfilled", value }),
    (reason): PromiseSettledResult<{ foods: FoodSummary[]; rawCount: number }> => ({ status: "rejected", reason }),
  );
  const localResults = local.status === "fulfilled" ? local.value.foods : [];
  const localRawCount = local.status === "fulfilled" ? local.value.rawCount : 0;
  const localSufficiency = localFoodSearchSufficiency(normalized, localResults, NUTRITION_SEARCH_RESULT_LIMIT);
  const eligibleProviders = eligibleRemoteFoodProviders({
    query: normalized,
    queryKind,
    localSufficient: localSufficiency.sufficient,
    configured: {
      FINELI: true,
      USDA: Boolean(process.env.USDA_FDC_API_KEY),
      OPEN_FOOD_FACTS: true,
    },
  });
  const useUsda = eligibleProviders.includes("USDA");
  const providerCalls = await searchEligibleRemoteFoodProviders({
    providers: eligibleProviders,
    queries: providerQueries,
    limit: NUTRITION_PROVIDER_CANDIDATE_LIMIT,
    searchers: { USDA: searchUsdaFoods, OPEN_FOOD_FACTS: searchOpenFoodFactsFoods },
  });
  const usdaCalls = providerCalls.USDA ?? [];
  const offCalls = providerCalls.OPEN_FOOD_FACTS ?? [];
  const fulfilled = (calls: PromiseSettledResult<ExternalFoodResult[]>[]) => calls.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const state = (result: PromiseSettledResult<ExternalFoodResult[]>, configured = true): ProviderState => {
    if (result.status === "fulfilled") return { attempted: true, available: true, error: null };
    const code = result.reason instanceof ProviderError ? result.reason.code : "UNAVAILABLE";
    return {
      attempted: true,
      available: configured,
      error: code === "TIMEOUT" || code === "RATE_LIMITED" ? code : "UNAVAILABLE",
    };
  };
  const providerState = (calls: PromiseSettledResult<ExternalFoodResult[]>[], configured = true): ProviderState => {
    if (!calls.length) return { attempted: false, available: configured, error: null };
    if (calls.some((call) => call.status === "fulfilled")) return { attempted: true, available: true, error: null };
    return state(calls[0]!, configured);
  };
  // findLocalFoods already returns canonical FoodSummary DTOs. Re-serializing
  // them would treat ISO timestamps as Dates and drop the whole local branch.
  const usdaRaw = fulfilled(usdaCalls);
  const offParsed = fulfilled(offCalls);
  const usdaRelevant = usdaRaw.filter((food) => isRelevantFoodResult(normalized, food));
  const offRelevant = offParsed.filter((food) => isRelevantFoodResult(normalized, food));
  const initialProviderCandidates = deduplicateExternalFoodResults(localResults, [
    ...usdaRelevant,
    ...offRelevant,
  ]);
  let providerResults = initialProviderCandidates
    .map(withResolvedFoodIcon)
    .map(withSearchMetadata);
  // A generic ingredient must not disappear merely because a provider's first
  // wording used a close synonym (for example mushroom/mushrooms or omelet/
  // omelette). Only take this extra USDA pass when the normal merged universe
  // produced nothing, keeping usual searches fast.
  if (!providerResults.length && useUsda) {
    const fallbackQueries = nutritionFoodIntent(normalized).searchQueries
      .filter((candidate) => candidate !== normalized)
      .slice(0, 3);
    const fallbacks = await Promise.allSettled(
      fallbackQueries.map((candidate) =>
        searchUsdaFoods(candidate, NUTRITION_PROVIDER_CANDIDATE_LIMIT)
      )
    );
    const fallbackResults = fallbacks.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    providerResults = deduplicateExternalFoodResults(localResults, fallbackResults)
      .map(withResolvedFoodIcon)
      .map(withSearchMetadata);
  }
  if (process.env.NODE_ENV === "development" && !providerResults.length) {
    console.info("[Nutrition search] empty result diagnostics", {
      query: normalized,
      localRaw: localRawCount,
      localRelevant: localResults.length,
      fineliRelevant: localResults.filter((food) => food.source === "FINELI").length,
      offParsed: offParsed.length,
      offRelevant: offRelevant.length,
      offOutcome: offCalls.length === 0 ? "not-attempted" : offCalls.some((call) => call.status === "fulfilled") ? "response" : "error",
      usdaRaw: usdaRaw.length,
      usdaRelevant: usdaRelevant.length,
      usdaOutcome: usdaCalls.length === 0 ? "not-attempted" : usdaCalls.some((call) => call.status === "fulfilled") ? "response" : "error",
      providerMerged: initialProviderCandidates.length,
      providerRelevant: providerResults.length,
    });
  }
  const rankedUsdaResults = rankExternalFoodResults(normalized, providerResults.filter(isUsdaGenericFood));
  const primaryGeneric = selectPrimaryGenericFood(normalized, rankedUsdaResults);
  const usdaGenericResults = primaryGeneric ? [primaryGeneric, ...rankedUsdaResults.filter((food) => food.externalId !== primaryGeneric.externalId)] : rankedUsdaResults;
  const genericResults = usdaGenericResults;
  const rankedPackagedResults = rankExternalFoodResults(normalized, providerResults.filter(isPackagedFoodResult));
  const packagedResults = rankedPackagedResults.slice(0, 8);
  // Rank the complete preview pool before applying the user-visible budget.
  // Describe and AI use this same ordered list, so they never import a
  // lower-ranked provider candidate merely because it appeared in an earlier
  // source bucket.
  const rankedResults = rankNutritionFoodCandidates(normalized, [
    ...genericResults,
    ...localResults,
    ...rankedPackagedResults,
  ]);
  const limited = limitFoodSearchResults({ genericResults, localResults, packagedResults });
  const localFineliAvailable = localResults.some((food) => food.source === "FINELI");
  const providers = { fineli: { attempted: false, available: localFineliAvailable, error: null } satisfies ProviderState, usda: providerState(usdaCalls, Boolean(process.env.USDA_FDC_API_KEY)), openFoodFacts: providerState(offCalls) };
  const warnings = [
    local.status === "rejected" ? "Saved foods are temporarily unavailable; provider results are still shown." : null,
    providers.usda.error ? "USDA results are temporarily unavailable." : null,
    providers.openFoodFacts.error ? "Packaged product results are temporarily unavailable." : null,
  ].filter((message): message is string => Boolean(message));
  const results = diversifyNutritionFoodCandidates(rankedResults).slice(0, NUTRITION_SEARCH_RESULT_LIMIT);
  if (process.env.NODE_ENV === "development") console.info("[FoodSearch]", { query, normalized, localRaw: localRawCount, localRelevant: localResults.length, strongLocal: localSufficiency.strongResultCount, localSufficient: localSufficiency.sufficient, eligibleProviders, fineliRelevant: localResults.filter((food) => food.source === "FINELI").length, usdaRaw: usdaRaw.length, usdaRelevant: usdaRelevant.length, offParsed: offParsed.length, offRelevant: offRelevant.length, providerMerged: providerResults.length, finalMerged: results.length, finalCount: results.length });
  const missingIntent = classifyFoodQuery(normalized) === "GENERIC" && !selectNutritionFoodCandidate(intent.rankQuery, results)
    ? intent.canonicalName
    : null;
  return { query: normalized, queryKind, ...limited, results, externalResults: [...limited.genericResults, ...limited.packagedResults], providers, warnings, missingIntent };
}
async function fetchExternal(provider: ExternalFoodResult["provider"], externalId: string) {
  if (provider === "FINELI") throw new ProviderError("UNAVAILABLE", "Fineli foods are synchronized from the official open-data package, not fetched during requests.");
  return provider === "USDA" ? getUsdaFood(externalId) : getOpenFoodFactsProduct(externalId);
}
const nutritionFields = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "transFatGrams", "addedSugarGrams", "sodiumMg", "saltGrams", "cholesterolMg", "potassiumMg", "calciumMg", "ironMg"] as const;
function persistenceFood(result: ExternalFoodResult) { return { type: result.foodType === "GENERIC" ? FoodType.GENERIC : FoodType.BRANDED, name: result.name, normalizedName: normalizeFoodQuery(result.name), description: result.description ?? null, brandName: result.brandName ?? null, barcode: result.barcode ?? null, imageUrl: result.imageUrl ?? null, languageCode: result.languageCode ?? null, countryCodes: result.countryCodes, nutritionBasisGrams: 100, ...result.nutritionPer100g, calorieValueSource: FoodDataValueSource.PROVIDER, source: providerFor(result.provider), sourceExternalId: result.externalId, sourceUpdatedAt: result.sourceUpdatedAt ?? null, verificationStatus: result.verificationStatus === "OFFICIAL_SOURCE" ? FoodVerificationStatus.OFFICIAL_SOURCE : result.verificationStatus === "COMMUNITY_SOURCE" ? FoodVerificationStatus.COMMUNITY_SOURCE : FoodVerificationStatus.UNVERIFIED, importStatus: result.isComplete ? FoodImportStatus.ACTIVE : FoodImportStatus.INCOMPLETE, freshnessStatus: FoodFreshnessStatus.FRESH, confidenceScore: result.confidenceScore, lastFetchedAt: new Date(), lastRevalidatedAt: new Date(), nextRevalidateAt: nextDate({ source: providerFor(result.provider), type: result.foodType === "GENERIC" ? FoodType.GENERIC : FoodType.BRANDED, importStatus: result.isComplete ? FoodImportStatus.ACTIVE : FoodImportStatus.INCOMPLETE }) }; }
function revisionData(foodId: string, revisionNumber: number, result: ExternalFoodResult, sourceRecordId: string, reason: FoodRevisionReason) { const food = persistenceFood(result); return { foodId, revisionNumber, reason, source: food.source, sourceExternalId: result.externalId, name: result.name, brandName: result.brandName, barcode: result.barcode, imageUrl: result.imageUrl, nutritionBasisGrams: 100, ...result.nutritionPer100g, confidenceScore: result.confidenceScore, verificationStatus: food.verificationStatus, sourceUpdatedAt: result.sourceUpdatedAt ?? null, sourceRecordId, normalizedDataChecksum: result.checksum }; }
async function persistProviderDetails(tx: Prisma.TransactionClient, foodId: string, result: ExternalFoodResult, source: FoodSource) {
  if (!result.details) return;
  const details = result.details;
  await tx.foodDetails.upsert({ where: { foodId }, create: { foodId, productImageUrl: details.productImageUrl ?? null, nutritionImageUrl: details.nutritionImageUrl ?? null, ingredientsImageUrl: details.ingredientsImageUrl ?? null, packageQuantityText: details.packageQuantityText ?? null, packageQuantityGrams: details.packageQuantityGrams ?? null, servingSizeText: details.servingSizeText ?? null, defaultServingGrams: details.defaultServingGrams ?? null, categories: details.categories, labels: details.labels, ingredientsText: details.ingredientsText ?? null, allergens: details.allergens, traces: details.traces, additives: details.additives, nutriScoreGrade: details.nutriScoreGrade ?? null, novaGroup: details.novaGroup ?? null, nutrientLevels: details.nutrientLevels ?? Prisma.JsonNull, veganStatus: details.veganStatus ?? null, vegetarianStatus: details.vegetarianStatus ?? null, palmOilStatus: details.palmOilStatus ?? null, providerCreatedAt: details.providerCreatedAt ?? null }, update: { productImageUrl: details.productImageUrl ?? null, nutritionImageUrl: details.nutritionImageUrl ?? null, ingredientsImageUrl: details.ingredientsImageUrl ?? null, packageQuantityText: details.packageQuantityText ?? null, packageQuantityGrams: details.packageQuantityGrams ?? null, servingSizeText: details.servingSizeText ?? null, defaultServingGrams: details.defaultServingGrams ?? null, categories: details.categories, labels: details.labels, ingredientsText: details.ingredientsText ?? null, allergens: details.allergens, traces: details.traces, additives: details.additives, nutriScoreGrade: details.nutriScoreGrade ?? null, novaGroup: details.novaGroup ?? null, nutrientLevels: details.nutrientLevels ?? Prisma.JsonNull, veganStatus: details.veganStatus ?? null, vegetarianStatus: details.vegetarianStatus ?? null, palmOilStatus: details.palmOilStatus ?? null, providerCreatedAt: details.providerCreatedAt ?? null } });
  await tx.foodNutrient.deleteMany({ where: { foodId } });
  if (details.nutrients.length) await tx.foodNutrient.createMany({ data: details.nutrients.map((nutrient) => ({ foodId, ...nutrient, basisGrams: 100, source, sourceExternalId: result.externalId })) });
}

async function persistProviderAliases(
  tx: Prisma.TransactionClient,
  foodId: string,
  result: ExternalFoodResult,
  source: FoodSource,
) {
  const aliases = buildProviderFoodAliasCandidates({
    provider: result.provider,
    rawData: result.raw,
    fallbackName: result.name,
    fallbackLanguageCode: result.languageCode,
  });

  for (const alias of aliases) {
    await tx.foodAlias.upsert({
      where: { foodId_normalizedName: { foodId, normalizedName: alias.normalizedName } },
      create: { foodId, ...alias, source },
      update: { ...alias, source },
    });
  }
}

export async function importExternalFood(provider: ExternalFoodResult["provider"], externalId: string) {
  const source = providerFor(provider);
  const existing = await prisma.food.findUnique({ where: { source_sourceExternalId: { source, sourceExternalId: externalId } }, select: { id: true } });
  if (existing) { await prisma.food.update({ where: { id: existing.id }, data: { selectionCount: { increment: 1 } } }); return prisma.food.findUniqueOrThrow({ where: { id: existing.id } }); }
  const result = await fetchExternal(provider, externalId);
  try { return await prisma.$transaction(async (tx) => { const food = await tx.food.create({ data: { ...persistenceFood(result), selectionCount: 1 } }); const sourceRecord = await tx.foodSourceRecord.create({ data: { foodId: food.id, source, sourceExternalId: result.externalId, rawData: result.raw as Prisma.InputJsonValue, checksum: result.checksum, sourceUpdatedAt: result.sourceUpdatedAt ?? null, responseStatus: 200 } }); const revision = await tx.foodRevision.create({ data: revisionData(food.id, 1, result, sourceRecord.id, FoodRevisionReason.INITIAL_IMPORT) }); await tx.food.update({ where: { id: food.id }, data: { currentRevisionId: revision.id } }); if (result.servings.length) await tx.foodServing.createMany({ data: result.servings.map((serving, index) => ({ foodId: food.id, name: serving.name, quantity: serving.quantity, grams: serving.grams, householdUnit: serving.householdUnit ?? null, isDefault: index === 0, source, sourceExternalId: serving.sourceExternalId ?? null })) }); await persistProviderAliases(tx, food.id, result, source); await persistProviderDetails(tx, food.id, result, source); return tx.food.findUniqueOrThrow({ where: { id: food.id } }); }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.food.findUniqueOrThrow({ where: { source_sourceExternalId: { source, sourceExternalId: result.externalId } } }); throw error; }
}

export async function revalidateFood(foodId: string, force = false) {
  const food = await prisma.food.findUnique({ where: { id: foodId }, include: { currentRevision: true } });
  if (!food) return { status: "NOT_FOUND" as const };
  if (!force && food.nextRevalidateAt && food.nextRevalidateAt > new Date()) return { status: "SKIPPED_FRESH" as const, foodId };
  if (food.source === FoodSource.FINELI) return { status: "SKIPPED_DATASET_SYNC" as const, foodId };
  if (food.source !== FoodSource.USDA && food.source !== FoodSource.OPEN_FOOD_FACTS) return { status: "SKIPPED_UNSUPPORTED" as const, foodId };
  const provider = food.source === FoodSource.USDA ? "USDA" : "OPEN_FOOD_FACTS";
  try {
    const incoming = await fetchExternal(provider, food.sourceExternalId);
    const incomingValues = incoming.nutritionPer100g;
    const currentValues = nutritionFromRecord(food as unknown as Record<string, unknown>);
    const completeRegression = food.importStatus === FoodImportStatus.ACTIVE && !incoming.isComplete;
    if (completeRegression) { await prisma.foodSourceRecord.create({ data: { foodId, source: food.source, sourceExternalId: food.sourceExternalId, rawData: incoming.raw as Prisma.InputJsonValue, checksum: incoming.checksum, sourceUpdatedAt: incoming.sourceUpdatedAt ?? null, responseStatus: 200 } }); await prisma.food.update({ where: { id: foodId }, data: { freshnessStatus: FoodFreshnessStatus.PROVIDER_UNAVAILABLE, lastFetchedAt: new Date(), nextRevalidateAt: new Date(Date.now() + 7 * 86400000) } }); return { status: "INCOMPLETE_PROVIDER_DATA" as const, foodId }; }
    const changes = isMaterialFoodChange({ ...currentValues, name: food.name, brandName: food.brandName, barcode: food.barcode }, { ...incomingValues, name: incoming.name, brandName: incoming.brandName, barcode: incoming.barcode });
    return await prisma.$transaction(async (tx) => { const sourceRecord = await tx.foodSourceRecord.create({ data: { foodId, source: food.source, sourceExternalId: food.sourceExternalId, rawData: incoming.raw as Prisma.InputJsonValue, checksum: incoming.checksum, sourceUpdatedAt: incoming.sourceUpdatedAt ?? null, responseStatus: 200 } }); const persisted = persistenceFood(incoming); if (!changes || food.currentRevision?.normalizedDataChecksum === incoming.checksum) { await tx.food.update({ where: { id: foodId }, data: { lastFetchedAt: new Date(), lastRevalidatedAt: new Date(), nextRevalidateAt: nextDate(food), freshnessStatus: FoodFreshnessStatus.FRESH } }); await persistProviderAliases(tx, foodId, incoming, food.source); await persistProviderDetails(tx, foodId, incoming, food.source); return { status: "UNCHANGED" as const, foodId, currentRevisionId: food.currentRevisionId }; }
      const revisionNumber = (await tx.foodRevision.aggregate({ where: { foodId }, _max: { revisionNumber: true } }))._max.revisionNumber! + 1;
      const revision = await tx.foodRevision.create({ data: revisionData(foodId, revisionNumber, incoming, sourceRecord.id, force ? FoodRevisionReason.MANUAL_REFRESH : FoodRevisionReason.PROVIDER_UPDATE) }); await tx.food.update({ where: { id: foodId }, data: { ...persisted, currentRevisionId: revision.id, lastFetchedAt: new Date(), lastRevalidatedAt: new Date(), nextRevalidateAt: nextDate(persisted) } }); await persistProviderAliases(tx, foodId, incoming, food.source); await persistProviderDetails(tx, foodId, incoming, food.source); return { status: "UPDATED" as const, foodId, previousRevisionId: food.currentRevisionId, currentRevisionId: revision.id, materialChanges: changes ? nutritionFields.filter((field) => currentValues[field] !== incomingValues[field]) : [] }; });
  } catch (error) { const state = error instanceof ProviderError && error.code === "NOT_FOUND" ? FoodFreshnessStatus.SOURCE_REMOVED : FoodFreshnessStatus.PROVIDER_UNAVAILABLE; await prisma.food.update({ where: { id: foodId }, data: { freshnessStatus: state, nextRevalidateAt: new Date(Date.now() + (error instanceof ProviderError && error.code === "RATE_LIMITED" ? 3600000 : 86400000)) } }); return { status: state === FoodFreshnessStatus.SOURCE_REMOVED ? "SOURCE_REMOVED" as const : "UNAVAILABLE" as const, foodId }; }
}
