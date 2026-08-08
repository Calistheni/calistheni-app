import { z } from "zod";
import {
  checksumExternalFood,
  normalizeFoodQuery,
  validateNutrition,
  withChecksum,
} from "@/lib/nutrition/normalization";
import { ProviderError, providerFetch } from "./http";
import type { ExternalFoodResult, NutritionValues } from "../types";
import { preferredPreparationSearchTerm, scoreFoodResult } from "../search-ranking";

const finiteNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
  z.number().finite(),
);

const nullableNumber = finiteNumber.nullable().optional();

// `/foods/search` returns flattened nutrient entries. The detail endpoint does
// not: it nests nutrient identity under `nutrient` and stores the value in
// `amount`. Keeping schemas separate prevents a valid search preview from
// silently losing all of its nutrition values.
const usdaSearchNutrientSchema = z
  .object({
    nutrientId: z.union([z.number(), z.string()]).optional(),
    nutrientNumber: z.union([z.number(), z.string()]).optional(),
    nutrientName: z.string().optional(),
    unitName: z.string().optional(),
    value: nullableNumber,
  })
  .passthrough();

const usdaDetailNutrientSchema = z
  .object({
    nutrient: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        number: z.union([z.number(), z.string()]).optional(),
        name: z.string().optional(),
        unitName: z.string().optional(),
      })
      .optional(),
    amount: nullableNumber,
  })
  .passthrough();

const foodPortionSchema = z
  .object({
    portionDescription: z.string().optional(),
    modifier: z.string().optional(),
    amount: nullableNumber,
    gramWeight: nullableNumber,
  })
  .passthrough();

const foodIdentitySchema = z
  .object({
    fdcId: z.union([z.number(), z.string()]),
    description: z.string().optional(),
    brandOwner: z.string().optional(),
    brandName: z.string().optional(),
    gtinUpc: z.string().optional(),
    dataType: z.string().optional(),
    foodPortions: z.array(foodPortionSchema).optional(),
    publicationDate: z.string().optional(),
    modifiedDate: z.string().optional(),
  })
  .passthrough();

const usdaSearchFoodSchema = foodIdentitySchema.extend({
  foodNutrients: z.array(usdaSearchNutrientSchema).optional(),
});
const usdaDetailFoodSchema = foodIdentitySchema.extend({
  foodNutrients: z.array(usdaDetailNutrientSchema).optional(),
});
const usdaSearchResponseSchema = z.object({ foods: z.array(usdaSearchFoodSchema).default([]) }).passthrough();

type UsdaSearchFood = z.infer<typeof usdaSearchFoodSchema>;
type UsdaDetailFood = z.infer<typeof usdaDetailFoodSchema>;

const nutrientIds: Record<string, keyof NutritionValues> = {
  "1008": "caloriesKcal",
  "1003": "proteinGrams",
  "1004": "fatGrams",
  "1005": "carbohydrateGrams",
  "1079": "fiberGrams",
  "2000": "sugarGrams",
  "1258": "saturatedFatGrams",
  "1093": "sodiumMg",
};

const nutrientNumbers: Record<string, keyof NutritionValues> = {
  "208": "caloriesKcal",
  "203": "proteinGrams",
  "204": "fatGrams",
  "205": "carbohydrateGrams",
  "291": "fiberGrams",
  "269": "sugarGrams",
  "606": "saturatedFatGrams",
  "307": "sodiumMg",
};

function validNutrientValue(value: number | null | undefined): number | undefined {
  return value === null || value === undefined || !Number.isFinite(value) || value < 0 ? undefined : value;
}

function nutrientField(id: unknown, number: unknown, name: string): keyof NutritionValues | undefined {
  const byId = nutrientIds[String(id ?? "")];
  if (byId) return byId;
  const byNumber = nutrientNumbers[String(number ?? "")];
  if (byNumber) return byNumber;

  const normalizedName = name.toLocaleLowerCase();
  if (normalizedName.includes("protein")) return "proteinGrams";
  if (normalizedName.includes("carbohydrate")) return "carbohydrateGrams";
  if (normalizedName.includes("total lipid") || normalizedName === "fat") return "fatGrams";
  if (normalizedName.includes("fiber")) return "fiberGrams";
  if (normalizedName.includes("total sugars") || normalizedName === "sugars") return "sugarGrams";
  if (normalizedName.includes("saturated") && normalizedName.includes("fat")) return "saturatedFatGrams";
  if (normalizedName.includes("sodium")) return "sodiumMg";
  return undefined;
}

type NutrientCandidate = {
  id?: unknown;
  number?: unknown;
  name?: string;
  unit?: string;
  value?: number | null;
};

function mapUsdaNutrients(nutrients: NutrientCandidate[]): NutritionValues {
  const values: NutritionValues = {};
  let energyKj: number | undefined;

  for (const nutrient of nutrients) {
    const value = validNutrientValue(nutrient.value);
    if (value === undefined) continue;

    const name = nutrient.name ?? "";
    const unit = (nutrient.unit ?? "").trim().toLocaleLowerCase();
    const isEnergy = name.toLocaleLowerCase().includes("energy");

    if (isEnergy && (unit === "kj" || unit === "kilojoule" || unit === "kilojoules")) {
      energyKj = value;
      continue;
    }

    const field = nutrientField(nutrient.id, nutrient.number, name);
    if (!field) continue;

    if (field === "caloriesKcal" && unit && unit !== "kcal" && unit !== "kilocalorie" && unit !== "kilocalories") {
      // An energy nutrient identified by a fallback ID must never display kJ as kcal.
      if (unit === "kj" || unit === "kilojoule" || unit === "kilojoules") energyKj = value;
      continue;
    }

    values[field] = field === "sodiumMg" && unit === "g" ? value * 1000 : value;
  }

  if (values.caloriesKcal === undefined && energyKj !== undefined) {
    values.caloriesKcal = energyKj / 4.184;
  }

  return validateNutrition(values);
}

export function mapUsdaSearchNutrients(food: UsdaSearchFood): NutritionValues {
  return mapUsdaNutrients(
    (food.foodNutrients ?? []).map((nutrient) => ({
      id: nutrient.nutrientId,
      number: nutrient.nutrientNumber,
      name: nutrient.nutrientName,
      unit: nutrient.unitName,
      value: nutrient.value,
    })),
  );
}

export function mapUsdaDetailNutrients(food: UsdaDetailFood): NutritionValues {
  return mapUsdaNutrients(
    (food.foodNutrients ?? []).map((nutrient) => ({
      id: nutrient.nutrient?.id,
      number: nutrient.nutrient?.number,
      name: nutrient.nutrient?.name,
      unit: nutrient.nutrient?.unitName,
      value: nutrient.amount,
    })),
  );
}

export function normalizeUsdaFdcId(value: unknown): string {
  const source = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(source)) {
    throw new ProviderError("INVALID_IDENTIFIER", "USDA food identifiers must be positive FDC IDs.");
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ProviderError("INVALID_IDENTIFIER", "USDA food identifiers must be positive FDC IDs.");
  }
  return String(parsed);
}

export function usdaFoodDetailPath(externalId: unknown): string {
  return `/food/${encodeURIComponent(normalizeUsdaFdcId(externalId))}`;
}

function sourceUpdatedAt(input: UsdaSearchFood | UsdaDetailFood): Date | undefined {
  const value = input.modifiedDate ?? input.publicationDate;
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function confidenceFor(nutrition: NutritionValues) {
  const primaryMacroCount = [nutrition.proteinGrams, nutrition.carbohydrateGrams, nutrition.fatGrams].filter(
    (value) => value !== undefined,
  ).length;
  const hasCalories = nutrition.caloriesKcal !== undefined;
  const isComplete = hasCalories && primaryMacroCount === 3;
  return {
    isComplete,
    confidenceScore: isComplete ? 0.98 : hasCalories || primaryMacroCount > 0 ? 0.65 : 0.2,
  };
}

function normalizeUsdaFood(
  input: UsdaSearchFood | UsdaDetailFood,
  nutrition: NutritionValues,
): ExternalFoodResult {
  const name = input.description?.trim();
  if (!name) throw new ProviderError("INCOMPLETE_DATA", "USDA food is missing a description.");

  const fdcId = normalizeUsdaFdcId(input.fdcId);
  const foodType: "GENERIC" | "BRANDED" = input.dataType?.toLocaleLowerCase().includes("branded")
    ? "BRANDED"
    : "GENERIC";
  const servings = (input.foodPortions ?? []).flatMap((portion) => {
    const grams = validNutrientValue(portion.gramWeight);
    if (grams === undefined || grams <= 0) return [];
    return [{ name: portion.portionDescription ?? portion.modifier ?? "Serving", quantity: portion.amount ?? 1, grams }];
  });
  const quality = confidenceFor(nutrition);

  return withChecksum({
    provider: "USDA" as const,
    externalId: fdcId,
    foodType,
    name,
    brandName: input.brandOwner ?? input.brandName,
    barcode: input.gtinUpc,
    countryCodes: [],
    nutritionPer100g: nutrition,
    servings,
    confidenceScore: quality.confidenceScore,
    verificationStatus: "OFFICIAL_SOURCE" as const,
    isComplete: quality.isComplete,
    sourceUpdatedAt: sourceUpdatedAt(input),
    raw: input,
  });
}

export function normalizeUsdaSearchFood(input: unknown): ExternalFoodResult {
  const food = usdaSearchFoodSchema.parse(input);
  return normalizeUsdaFood(food, mapUsdaSearchNutrients(food));
}

export function normalizeUsdaDetailedFood(input: unknown): ExternalFoodResult {
  const food = usdaDetailFoodSchema.parse(input);
  return normalizeUsdaFood(food, mapUsdaDetailNutrients(food));
}

function config() {
  const key = process.env.USDA_FDC_API_KEY;
  return key
    ? { key, base: (process.env.USDA_FDC_BASE_URL ?? "https://api.nal.usda.gov/fdc/v1").replace(/\/$/, "") }
    : null;
}

const dataTypeRank = (dataType: string | undefined) => {
  const normalized = dataType?.toLocaleLowerCase() ?? "";
  if (normalized.includes("foundation")) return 0;
  if (normalized.includes("sr legacy")) return 1;
  if (normalized.includes("survey")) return 2;
  if (normalized.includes("branded")) return 3;
  return 4;
};

const PREPARED_INTENT_TERMS = ["juice", "nectar", "pie", "dessert", "sauce", "syrup", "cake", "baby", "restaurant", "fast food"];

function queryTokens(value: string) {
  return normalizeFoodQuery(value).split(/[\s-]+/).filter(Boolean);
}

function hasPreparedIntent(query: string) {
  const tokens = queryTokens(query);
  return PREPARED_INTENT_TERMS.some((term) => tokens.includes(term));
}

type UsdaSearchCandidate = {
  result: ExternalFoodResult;
  dataType?: string;
  fromGenericFallback: boolean;
};

/** Uses the same preparation-aware scorer as every nutrition search surface. */
export function rankUsdaGenericResults(query: string, candidates: UsdaSearchCandidate[]) {
  const score = (candidate: UsdaSearchCandidate) => {
    let value = scoreFoodResult(query, candidate.result);
    if (candidate.result.isComplete) value += 18;
    if (!candidate.result.brandName) value += 8;
    const typeRank = dataTypeRank(candidate.dataType);
    value += typeRank === 0 ? 12 : typeRank === 1 ? 10 : typeRank === 2 ? 7 : typeRank === 3 ? -8 : 0;
    if (candidate.fromGenericFallback) value += 3;
    return value;
  };

  return [...candidates].sort((left, right) => {
    const scoreDifference = score(right) - score(left);
    if (scoreDifference !== 0) return scoreDifference;
    const completenessDifference = Number(right.result.isComplete) - Number(left.result.isComplete);
    if (completenessDifference !== 0) return completenessDifference;
    return dataTypeRank(left.dataType) - dataTypeRank(right.dataType);
  });
}

export async function searchUsdaFoods(query: string, limit = 8) {
  const configured = config();
  if (!configured) throw new ProviderError("UNAVAILABLE", "USDA is not configured.");
  const normalizedQuery = normalizeFoodQuery(query);
  const search = async (searchQuery: string) => {
    const response = await providerFetch(`${configured.base}/foods/search?api_key=${encodeURIComponent(configured.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
        pageSize: Math.min(Math.max(limit * 3, 12), 36),
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
    });
    return usdaSearchResponseSchema.parse(await response.json()).foods;
  };

  const firstPage = await search(normalizedQuery);
  // Supplement broad FDC results with the normal eaten form for cooked
  // staples, while fruit and fresh vegetables retain the raw fallback.
  const fallbackPreparation = preferredPreparationSearchTerm(normalizedQuery);
  const genericPage = !normalizedQuery.includes("raw") && !hasPreparedIntent(normalizedQuery) && normalizedQuery.split(" ").length <= 3
    ? await search(`${normalizedQuery} ${fallbackPreparation ?? "raw"}`)
    : [];
  const seen = new Set<string>();
  const normalized = [
    ...genericPage.map((food) => ({ food, fromGenericFallback: true })),
    ...firstPage.map((food) => ({ food, fromGenericFallback: false })),
  ]
    .map(({ food, fromGenericFallback }) => ({
      result: normalizeUsdaSearchFood(food),
      dataType: food.dataType,
      fromGenericFallback,
    }))
    .filter(({ result }) => {
      if (seen.has(result.externalId)) return false;
      seen.add(result.externalId);
      return true;
    });

  return rankUsdaGenericResults(query, normalized)
    .slice(0, limit)
    .map(({ result }) => result);
}

export async function getUsdaFood(externalId: string) {
  const configured = config();
  if (!configured) throw new ProviderError("UNAVAILABLE", "USDA is not configured.");
  const detailPath = usdaFoodDetailPath(externalId);
  const response = await providerFetch(
    `${configured.base}${detailPath}?api_key=${encodeURIComponent(configured.key)}`,
    { headers: { Accept: "application/json" } },
  );
  const result = normalizeUsdaDetailedFood(await response.json());
  const nutrition = result.nutritionPer100g;
  if (
    nutrition.caloriesKcal === undefined &&
    nutrition.proteinGrams === undefined &&
    nutrition.carbohydrateGrams === undefined &&
    nutrition.fatGrams === undefined
  ) {
    throw new ProviderError("INCOMPLETE_DATA", "USDA food does not contain usable primary nutrition.");
  }
  return result;
}

export const usdaChecksum = checksumExternalFood;
