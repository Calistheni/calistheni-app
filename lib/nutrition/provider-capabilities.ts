import { normalizeFoodQuery } from "./normalization";
import { isSufficientNutritionFoodCandidate, type FoodQueryKind } from "./search-ranking";
import type { ExternalFoodResult, FoodSummary } from "./types";

export type NutritionProviderName = "FINELI" | "USDA" | "OPEN_FOOD_FACTS";
export const NUTRITION_REMOTE_SEARCH_MIN_LENGTH = 3;

export type FoodProviderCapability = {
  localDataset: boolean;
  remoteSearch: boolean;
  localizedNames: boolean;
  genericFoods: boolean;
  packagedFoods: boolean;
  barcodeSearch: boolean;
  unicodeTextSearch: boolean;
  cost: "LOCAL" | "REMOTE_LOW" | "REMOTE_METERED";
};

export const FOOD_PROVIDER_CAPABILITIES: Record<NutritionProviderName, FoodProviderCapability> = {
  FINELI: { localDataset: true, remoteSearch: false, localizedNames: true, genericFoods: true, packagedFoods: false, barcodeSearch: false, unicodeTextSearch: true, cost: "LOCAL" },
  USDA: { localDataset: false, remoteSearch: true, localizedNames: false, genericFoods: true, packagedFoods: true, barcodeSearch: false, unicodeTextSearch: false, cost: "REMOTE_METERED" },
  OPEN_FOOD_FACTS: { localDataset: false, remoteSearch: true, localizedNames: true, genericFoods: false, packagedFoods: true, barcodeSearch: true, unicodeTextSearch: true, cost: "REMOTE_LOW" },
};

function localSearchNames(food: FoodSummary) {
  return [food.name, ...(food.localizedNames ?? []).map((alias) => alias.name)]
    .map(normalizeFoodQuery)
    .filter(Boolean);
}

function isStrongLocalMatch(query: string, food: FoodSummary) {
  const normalized = normalizeFoodQuery(query);
  const queryTokens = normalized.split(" ").filter(Boolean);
  const names = localSearchNames(food);
  const exactOrPrefix = names.some((name) => name === normalized || name.startsWith(`${normalized} `));
  const fullTokenCoverage = queryTokens.length > 0 && queryTokens.every((token) =>
    names.some((name) => name.split(" ").some((word) => word === token || (token.length >= 3 && word.startsWith(token))))
    || normalizeFoodQuery(food.brandName ?? "").split(" ").includes(token)
  );
  return exactOrPrefix || fullTokenCoverage || isSufficientNutritionFoodCandidate(query, food);
}

export function localFoodSearchSufficiency(query: string, foods: FoodSummary[], desiredResultCount: number) {
  const strongResultCount = foods.filter((food) => isStrongLocalMatch(query, food)).length;
  return {
    desiredResultCount,
    strongResultCount,
    sufficient: strongResultCount >= desiredResultCount,
  };
}

export function eligibleRemoteFoodProviders({
  query,
  queryKind,
  localSufficient,
  configured,
}: {
  query: string;
  queryKind: FoodQueryKind;
  localSufficient: boolean;
  configured: Partial<Record<NutritionProviderName, boolean>>;
}) {
  if (localSufficient || normalizeFoodQuery(query).length < NUTRITION_REMOTE_SEARCH_MIN_LENGTH) return [];
  return (Object.keys(FOOD_PROVIDER_CAPABILITIES) as NutritionProviderName[]).filter((provider) => {
    const capability = FOOD_PROVIDER_CAPABILITIES[provider];
    if (!capability.remoteSearch || configured[provider] === false) return false;
    if (!capability.unicodeTextSearch && /[^\x00-\x7F]/u.test(query)) return false;
    return queryKind !== "BARCODE" || capability.barcodeSearch;
  });
}

export type RemoteNutritionProviderName = "USDA" | "OPEN_FOOD_FACTS";

/** Runs independent eligible providers in parallel while isolating failures. */
export async function searchEligibleRemoteFoodProviders({
  providers,
  queries,
  limit,
  searchers,
}: {
  providers: NutritionProviderName[];
  queries: string[];
  limit: number;
  searchers: Record<RemoteNutritionProviderName, (query: string, limit: number) => Promise<ExternalFoodResult[]>>;
}) {
  const entries = await Promise.all(
    providers.flatMap((provider) => provider === "FINELI" ? [] : [
      Promise.allSettled(queries.map((query) => searchers[provider](query, limit)))
        .then((calls) => [provider, calls] as const),
    ])
  );
  return Object.fromEntries(entries) as Partial<Record<RemoteNutritionProviderName, PromiseSettledResult<ExternalFoodResult[]>[]>>;
}
