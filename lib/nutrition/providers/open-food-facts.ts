import { z } from "zod";
import { normalizeBarcode, validateNutrition, withChecksum } from "@/lib/nutrition/normalization";
import { ProviderError, providerFetch } from "./http";
import type { ExternalFoodResult, NutritionValues } from "../types";

const finiteNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
  z.number().finite(),
);

const productSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    product_name: z.string().optional(),
    generic_name: z.string().optional(),
    brands: z.string().optional(),
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
    categories: z.string().optional(),
    categories_tags: z.array(z.string()).optional(),
    labels: z.string().optional(),
    labels_tags: z.array(z.string()).optional(),
    countries: z.string().optional(),
    nutriments: z.record(z.string(), z.unknown()).optional(),
    ingredients_text: z.string().optional(),
    allergens: z.string().optional(),
    allergens_tags: z.array(z.string()).optional(),
    traces: z.string().optional(),
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
const searchResponseSchema = z.object({ products: z.array(productSchema).default([]) }).passthrough();

export type OpenFoodFactsStatus = "FOUND" | "NOT_FOUND" | "INVALID_RESPONSE";

export function normalizeOpenFoodFactsStatus(status: unknown): OpenFoodFactsStatus {
  if (status === 1 || status === "1" || status === "success" || status === "found") return "FOUND";
  if (status === 0 || status === "0" || status === "not found" || status === "not_found" || status === "not-found") return "NOT_FOUND";
  return "INVALID_RESPONSE";
}

function base() {
  return (process.env.OPEN_FOOD_FACTS_BASE_URL ?? "https://world.openfoodfacts.org").replace(/\/$/, "");
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

export function normalizeOpenFoodFactsProduct(input: unknown): ExternalFoodResult {
  const product = productSchema.parse(input);
  const code = normalizeBarcode(String(product.code ?? ""));
  const name = product.product_name?.trim() || product.generic_name?.trim();
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

const fields = "code,product_name,generic_name,brands,quantity,product_quantity,serving_size,serving_quantity,categories,categories_tags,labels,labels_tags,countries,countries_tags,lang,image_front_url,image_front_small_url,image_nutrition_url,image_ingredients_url,nutriments,ingredients_text,allergens,allergens_tags,traces,traces_tags,additives_tags,nutriscore_grade,nova_group,nutrient_levels,ingredients_analysis_tags,last_modified_t,created_t";

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
    `${base()}/api/v3/product/${encodeURIComponent(code)}.json?fields=${encodeURIComponent(fields)}`,
    { headers: headers() },
  );
  const data = parseOpenFoodFactsProductResponse(await response.json());
  if (data.status === "NOT_FOUND" || !data.product) throw new ProviderError("NOT_FOUND", "Product not found.");
  return normalizeOpenFoodFactsProduct(data.product);
}

export async function searchOpenFoodFactsFoods(query: string, limit = 8) {
  const response = await providerFetch(
    `${base()}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${Math.min(limit, 30)}&fields=${encodeURIComponent(fields)}`,
    { headers: headers() },
  );
  const parsed = searchResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new ProviderError("INVALID_RESPONSE", "Open Food Facts returned an unsupported search response.");
  return parsed.data.products.flatMap((product) => {
    try {
      return [normalizeOpenFoodFactsProduct(product)];
    } catch {
      return [];
    }
  });
}
