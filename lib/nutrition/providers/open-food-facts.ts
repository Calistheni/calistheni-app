import { z } from "zod";
import { normalizeBarcode, normalizeFoodQuery, validateNutrition, withChecksum } from "@/lib/nutrition/normalization";
import { ProviderError, providerFetch } from "./http";
import type { ExternalFoodResult, NutritionValues } from "../types";

const finiteNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
  z.number().finite(),
);

const providerText = z.union([z.string(), z.array(z.string())]).transform((value) =>
  Array.isArray(value) ? value.join(", ") : value
);

const productSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    product_name: z.string().optional(),
    generic_name: z.string().optional(),
    brands: providerText.optional(),
    countries_tags: z.array(z.string()).optional(),
    lang: z.string().optional(),
    image_front_url: z.string().url().optional(),
    image_front_small_url: z.string().url().optional(),
    image_nutrition_url: z.string().url().optional(),
    image_ingredients_url: z.string().url().optional(),
    quantity: z.string().optional(),
    product_quantity: finiteNumber.optional(),
    serving_size: z.string().optional(),
    serving_quantity: finiteNumber.optional(),
    categories: providerText.optional(),
    categories_tags: z.array(z.string()).optional(),
    labels: providerText.optional(),
    labels_tags: z.array(z.string()).optional(),
    countries: providerText.optional(),
    nutriments: z.record(z.string(), z.unknown()).optional(),
    ingredients_text: providerText.optional(),
    allergens: providerText.optional(),
    allergens_tags: z.array(z.string()).optional(),
    traces: providerText.optional(),
    traces_tags: z.array(z.string()).optional(),
    additives_tags: z.array(z.string()).optional(),
    nutriscore_grade: z.string().optional(),
    nova_group: z.union([finiteNumber, z.null()]).optional(),
    nutrient_levels: z.record(z.string(), z.string()).optional(),
    ingredients_analysis_tags: z.array(z.string()).optional(),
    last_modified_t: z.union([finiteNumber, z.string()]).optional(),
    created_t: z.union([finiteNumber, z.string()]).optional(),
  })
  .passthrough();

// Open Food Facts v3 currently returns `status: "success"`, while older
// documented envelopes use numeric 1/0. Accept only those known variants;
// everything else is an invalid upstream response rather than untrusted data.
const productStatusSchema = z.union([
  z.literal(1),
  z.literal(0),
  z.literal("1"),
  z.literal("0"),
  z.literal("success"),
  z.literal("found"),
  z.literal("not found"),
  z.literal("not_found"),
  z.literal("not-found"),
]);
const productResponseSchema = z
  .object({
    status: productStatusSchema.optional(),
    product: productSchema.optional(),
  })
  .passthrough();
const searchResponseSchema = z.object({
  hits: z.array(z.unknown()).default([]),
  count: z.number().int().nonnegative().optional(),
  timed_out: z.boolean().optional(),
  warnings: z.array(z.unknown()).nullable().optional(),
}).passthrough();

export type OpenFoodFactsStatus = "FOUND" | "NOT_FOUND" | "INVALID_RESPONSE";

export function normalizeOpenFoodFactsStatus(status: unknown): OpenFoodFactsStatus {
  if (status === 1 || status === "1" || status === "success" || status === "found") return "FOUND";
  if (status === 0 || status === "0" || status === "not found" || status === "not_found" || status === "not-found") return "NOT_FOUND";
  return "INVALID_RESPONSE";
}

function base() {
  return (process.env.OPEN_FOOD_FACTS_BASE_URL ?? "https://world.openfoodfacts.org").replace(/\/$/, "");
}

function searchBase() {
  return (process.env.OPEN_FOOD_FACTS_SEARCH_BASE_URL ?? "https://search.openfoodfacts.org").replace(/\/$/, "");
}

function headers() {
  return {
    Accept: "application/json",
    "User-Agent": process.env.OPEN_FOOD_FACTS_USER_AGENT ?? "Calistheni/1.0 (https://calistheni.app)",
  };
}

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  return parsed === undefined || !Number.isFinite(parsed) || parsed < 0 ? undefined : parsed;
}

function milligrams(value: unknown, unit: unknown) {
  const amount = numeric(value);
  if (amount === undefined) return undefined;
  const normalizedUnit = typeof unit === "string" ? unit.toLowerCase() : "g";
  return normalizedUnit === "g" ? amount * 1000 : normalizedUnit === "mg" ? amount : undefined;
}

function confidenceFor(nutrition: NutritionValues) {
  const primaryMacroCount = [nutrition.proteinGrams, nutrition.carbohydrateGrams, nutrition.fatGrams].filter(
    (value) => value !== undefined,
  ).length;
  const hasCalories = nutrition.caloriesKcal !== undefined;
  const isComplete = hasCalories && primaryMacroCount === 3;
  return { isComplete, confidenceScore: isComplete ? 0.78 : hasCalories || primaryMacroCount > 0 ? 0.45 : 0.2 };
}

function providerTags(values: string[] | undefined, text?: string) {
  if (values?.length) return values.map((value) => value.replace(/^[a-z]{2}:/i, "").replace(/-/g, " "));
  return text ? text.split(",").map((value) => value.trim()).filter(Boolean) : [];
}

function providerDate(value: string | number | undefined) {
  if (value === undefined) return undefined;
  const timestamp = Number(value);
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const localizedNameField = /^(product_name|generic_name)(?:_([a-z]{2,3}))?$/i;

function meaningfulProviderText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return text.length > 0 && text.length <= 240 ? text : null;
}

/** Discovers every localized OFF product/generic name present in raw JSON. */
export function extractOpenFoodFactsLocalizedNames(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const product = input as Record<string, unknown>;
  const mainLanguage = meaningfulProviderText(product.lang)?.toLocaleLowerCase();
  const candidates = Object.entries(product)
    .flatMap(([field, value]) => {
      const match = field.match(localizedNameField);
      const name = meaningfulProviderText(value);
      if (!match || !name) return [];
      return [{
        name,
        languageCode: match[2]?.toLocaleLowerCase() ?? mainLanguage ?? undefined,
        kind: match[1]!.toLocaleLowerCase() as "product_name" | "generic_name",
      }];
    })
    .sort((left, right) => Number(left.kind === "generic_name") - Number(right.kind === "generic_name"));

  const names = new Map<string, { name: string; languageCode?: string }>();
  for (const candidate of candidates) {
    const normalized = normalizeFoodQuery(candidate.name);
    if (!normalized || names.has(normalized)) continue;
    names.set(normalized, {
      name: candidate.name,
      languageCode: candidate.languageCode,
    });
  }
  return [...names.values()];
}

/** Adds only useful product names and brand/name combinations as aliases. */
export function extractOpenFoodFactsAliases(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const product = input as Record<string, unknown>;
  const localizedNames = extractOpenFoodFactsLocalizedNames(product);
  const brands = typeof product.brands === "string"
    ? product.brands.split(",").map(meaningfulProviderText).filter((brand): brand is string => Boolean(brand)).slice(0, 4)
    : [];
  const aliases = new Map<string, { name: string; languageCode?: string }>();
  const add = (name: string, languageCode?: string) => {
    const normalized = normalizeFoodQuery(name);
    if (normalized && !aliases.has(normalized)) aliases.set(normalized, { name, languageCode });
  };

  for (const localized of localizedNames) {
    add(localized.name, localized.languageCode);
    for (const brand of brands) {
      if (normalizeFoodQuery(localized.name).includes(normalizeFoodQuery(brand))) continue;
      add(`${brand} ${localized.name}`, localized.languageCode);
    }
  }
  return [...aliases.values()];
}

function preferredLocalizedName(
  names: Array<{ name: string; languageCode?: string }>,
  query?: string,
) {
  if (!query) return null;
  const normalizedQuery = normalizeFoodQuery(query);
  return [...names].sort((left, right) => {
    const score = (name: string) => {
      const normalized = normalizeFoodQuery(name);
      if (normalized === normalizedQuery) return 3;
      if (normalized.startsWith(normalizedQuery)) return 2;
      return normalized.includes(normalizedQuery) ? 1 : 0;
    };
    return score(right.name) - score(left.name);
  }).find((candidate) => normalizeFoodQuery(candidate.name).includes(normalizedQuery))?.name ?? null;
}

export function normalizeOpenFoodFactsProduct(input: unknown, preferredQuery?: string): ExternalFoodResult {
  const product = productSchema.parse(input);
  const code = normalizeBarcode(String(product.code ?? ""));
  const localizedNames = extractOpenFoodFactsLocalizedNames(product);
  const name = preferredLocalizedName(localizedNames, preferredQuery)
    ?? meaningfulProviderText(product.product_name)
    ?? meaningfulProviderText(product.generic_name)
    ?? localizedNames[0]?.name;
  if (!code || !name) throw new ProviderError("INCOMPLETE_DATA", "Open Food Facts product is missing its barcode or name.");

  const nutriments = product.nutriments ?? {};
  const explicitKcal = numeric(nutriments["energy-kcal_100g"]);
  const energyKj = numeric(nutriments.energy_100g);
  const sodiumGrams = numeric(nutriments.sodium_100g);
  const nutrition = validateNutrition({
    caloriesKcal: explicitKcal ?? (energyKj === undefined ? undefined : energyKj / 4.184),
    proteinGrams: numeric(nutriments.proteins_100g),
    carbohydrateGrams: numeric(nutriments.carbohydrates_100g),
    fatGrams: numeric(nutriments.fat_100g),
    fiberGrams: numeric(nutriments.fiber_100g),
    sugarGrams: numeric(nutriments.sugars_100g),
    saturatedFatGrams: numeric(nutriments["saturated-fat_100g"]),
    transFatGrams: numeric(nutriments["trans-fat_100g"]),
    addedSugarGrams: numeric(nutriments["added-sugars_100g"]),
    sodiumMg: sodiumGrams === undefined ? undefined : sodiumGrams * 1000,
    saltGrams: numeric(nutriments.salt_100g),
    cholesterolMg: milligrams(nutriments.cholesterol_100g, nutriments.cholesterol_unit),
    potassiumMg: milligrams(nutriments.potassium_100g, nutriments.potassium_unit),
    calciumMg: milligrams(nutriments.calcium_100g, nutriments.calcium_unit),
    ironMg: milligrams(nutriments.iron_100g, nutriments.iron_unit),
  });
  const grams = product.serving_quantity && product.serving_quantity > 0 ? product.serving_quantity : undefined;
  const sourceUpdatedAt = providerDate(product.last_modified_t);
  const quality = confidenceFor(nutrition);

  return withChecksum({
    provider: "OPEN_FOOD_FACTS" as const,
    externalId: code,
    foodType: "BRANDED" as const,
    name,
    brandName: product.brands,
    barcode: code,
    imageUrl: product.image_front_small_url ?? product.image_front_url,
    languageCode: product.lang,
    localizedNames: extractOpenFoodFactsAliases(product),
    countryCodes: product.countries_tags ?? [],
    nutritionPer100g: nutrition,
    servings: grams ? [{ name: product.serving_size ?? "Serving", quantity: 1, grams }] : [],
    confidenceScore: quality.confidenceScore,
    verificationStatus: "COMMUNITY_SOURCE" as const,
    isComplete: quality.isComplete,
    sourceUpdatedAt: sourceUpdatedAt && !Number.isNaN(sourceUpdatedAt.getTime()) ? sourceUpdatedAt : undefined,
    details: {
      productImageUrl: product.image_front_url ?? product.image_front_small_url,
      nutritionImageUrl: product.image_nutrition_url,
      ingredientsImageUrl: product.image_ingredients_url,
      packageQuantityText: product.quantity,
      packageQuantityGrams: product.product_quantity,
      servingSizeText: product.serving_size,
      defaultServingGrams: grams,
      categories: providerTags(product.categories_tags, product.categories),
      labels: providerTags(product.labels_tags, product.labels),
      ingredientsText: product.ingredients_text?.trim() || undefined,
      allergens: providerTags(product.allergens_tags, product.allergens),
      traces: providerTags(product.traces_tags, product.traces),
      additives: providerTags(product.additives_tags),
      nutriScoreGrade: product.nutriscore_grade?.trim().toUpperCase() || undefined,
      novaGroup: product.nova_group ?? undefined,
      nutrientLevels: product.nutrient_levels,
      veganStatus: product.ingredients_analysis_tags?.includes("en:vegan") ? "VEGAN" : product.ingredients_analysis_tags?.includes("en:non-vegan") ? "NOT_VEGAN" : undefined,
      vegetarianStatus: product.ingredients_analysis_tags?.includes("en:vegetarian") ? "VEGETARIAN" : product.ingredients_analysis_tags?.includes("en:non-vegetarian") ? "NOT_VEGETARIAN" : undefined,
      palmOilStatus: product.ingredients_analysis_tags?.includes("en:palm-oil") ? "CONTAINS" : product.ingredients_analysis_tags?.includes("en:palm-oil-free") ? "FREE" : undefined,
      providerCreatedAt: providerDate(product.created_t),
      nutrients: [
        ["transFatGrams", "Trans fat", nutrition.transFatGrams, "g"],
        ["addedSugarGrams", "Added sugars", nutrition.addedSugarGrams, "g"],
        ["cholesterolMg", "Cholesterol", nutrition.cholesterolMg, "mg"],
        ["potassiumMg", "Potassium", nutrition.potassiumMg, "mg"],
        ["calciumMg", "Calcium", nutrition.calciumMg, "mg"],
        ["ironMg", "Iron", nutrition.ironMg, "mg"],
      ].flatMap(([nutrientKey, displayName, amount, unit]) => typeof amount === "number" ? [{ nutrientKey: String(nutrientKey), displayName: String(displayName), amount, unit: String(unit) }] : []),
    },
    raw: product,
  });
}

// Search-a-licious requires the expected languages explicitly; without this it
// searches English subfields only. Extraction remains dynamic for every
// localized name field returned in a hit.
const localizedSearchLanguageCodes = [
  "ar", "bg", "ca", "cs", "da", "de", "el", "en", "es", "et", "fi",
  "fr", "he", "hi", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv",
  "mk", "ms", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sr",
  "sv", "th", "tr", "uk", "vi", "zh",
] as const;

export function openFoodFactsSearchUrl(query: string, limit: number) {
  const url = new URL(`${searchBase()}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("langs", localizedSearchLanguageCodes.join(","));
  url.searchParams.set("boost_phrase", "true");
  url.searchParams.set("page_size", String(Math.min(limit, 12)));
  return url;
}

export function parseOpenFoodFactsSearchResponse(input: unknown, query: string) {
  const parsed = searchResponseSchema.safeParse(input);
  if (!parsed.success) throw new ProviderError("INVALID_RESPONSE", "Open Food Facts returned an unsupported search response.");
  const foods: ExternalFoodResult[] = [];
  let rejectedCount = 0;
  for (const product of parsed.data.hits) {
    try {
      foods.push(normalizeOpenFoodFactsProduct(product, query));
    } catch {
      rejectedCount += 1;
    }
  }
  return {
    foods,
    rawCount: parsed.data.hits.length,
    parsedCount: foods.length,
    rejectedCount,
    providerCount: parsed.data.count ?? parsed.data.hits.length,
    timedOut: parsed.data.timed_out ?? false,
  };
}

export function parseOpenFoodFactsProductResponse(input: unknown) {
  const parsed = productResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError("INVALID_RESPONSE", "Open Food Facts returned an unsupported product response.");
  }
  const status = normalizeOpenFoodFactsStatus(parsed.data.status);
  if (status === "INVALID_RESPONSE") {
    throw new ProviderError("INVALID_RESPONSE", "Open Food Facts returned an unsupported product status.");
  }
  return { status, product: parsed.data.product };
}

export async function getOpenFoodFactsProduct(barcode: string) {
  const code = normalizeBarcode(barcode);
  if (!code) throw new ProviderError("INVALID_IDENTIFIER", "Invalid barcode.");
  const response = await providerFetch(
    `${base()}/api/v3/product/${encodeURIComponent(code)}.json?fields=raw`,
    { headers: headers() },
  );
  const data = parseOpenFoodFactsProductResponse(await response.json());
  if (data.status === "NOT_FOUND" || !data.product) throw new ProviderError("NOT_FOUND", "Product not found.");
  return normalizeOpenFoodFactsProduct(data.product);
}

export async function searchOpenFoodFactsFoods(query: string, limit = 8) {
  const url = openFoodFactsSearchUrl(query, limit);
  try {
    const response = await providerFetch(url.toString(), { headers: headers() });
    const result = parseOpenFoodFactsSearchResponse(await response.json(), query);
    if (process.env.NODE_ENV === "development") {
      console.info("[OpenFoodFactsSearch]", {
        endpoint: `${url.origin}${url.pathname}`,
        method: "GET",
        encodedQuery: url.searchParams.toString(),
        languages: localizedSearchLanguageCodes,
        requestedFields: "provider default search projection",
        pageSize: Math.min(limit, 12),
        httpStatus: response.status,
        rawCount: result.rawCount,
        parsedCount: result.parsedCount,
        rejectedCount: result.rejectedCount,
        providerCount: result.providerCount,
        timedOut: result.timedOut,
      });
    }
    return result.foods;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.info("[OpenFoodFactsSearch]", {
        endpoint: `${url.origin}${url.pathname}`,
        method: "GET",
        encodedQuery: url.searchParams.toString(),
        pageSize: Math.min(limit, 12),
        httpStatus: error instanceof ProviderError ? error.httpStatus ?? null : null,
        outcome: "error",
        error: error instanceof ProviderError ? error.code : "UNAVAILABLE",
      });
    }
    throw error;
  }
}
