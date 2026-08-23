import { z } from "zod";
import { normalizeFoodQuery, validateNutrition, withChecksum } from "../normalization";
import type { ExternalFoodResult, NutritionValues } from "../types";
import { ProviderError, providerFetch } from "./http";

const finiteNumber = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? Number(value) : value,
  z.number().finite().nonnegative(),
);
const localizedTextSchema = z.object({ en: z.string().optional(), fi: z.string().optional(), sv: z.string().optional() }).passthrough();
const codedValueSchema = z.object({ code: z.string(), name: localizedTextSchema.optional(), description: localizedTextSchema.optional() }).passthrough();
const codedValuesSchema = z.preprocess(
  (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value],
  z.array(codedValueSchema),
);
const unitSchema = z.object({
  code: z.string().optional(),
  name: localizedTextSchema.optional(),
  description: localizedTextSchema.optional(),
  grams: finiteNumber.optional(),
  mass: finiteNumber.optional(),
  value: finiteNumber.optional(),
  amount: finiteNumber.optional(),
  unit: codedValueSchema.optional(),
}).passthrough();

export const fineliFoodSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  type: codedValueSchema,
  name: localizedTextSchema,
  preparationMethod: codedValuesSchema,
  ingredientClass: codedValuesSchema,
  functionClass: codedValuesSchema,
  ediblePortion: finiteNumber.optional(),
  units: z.array(unitSchema).default([]),
  energyKcal: finiteNumber.optional(),
  fat: finiteNumber.optional(),
  protein: finiteNumber.optional(),
  carbohydrate: finiteNumber.optional(),
  salt: finiteNumber.optional(),
  saturatedFat: finiteNumber.optional(),
  sugar: finiteNumber.optional(),
}).passthrough();

export type FineliFood = z.infer<typeof fineliFoodSchema>;

const USEFUL_UNIT_LABELS: Record<string, string> = {
  KPL_S: "Small piece",
  KPL_M: "Medium-sized piece",
  KPL_L: "Big piece",
  PORTS: "Small portion",
  PORTM: "Medium portion",
  PORTL: "Large portion",
  DL: "Decilitre",
};
const EXCLUDED_UNIT_CODES = new Set(["KJ1000", "PORT1000KJ", "PORTION_1000_KJ", "E1000KJ"]);

function base() {
  return (process.env.FINELI_BASE_URL ?? "https://fineli.fi/fineli/api/v1").replace(/\/$/, "");
}

function headers() {
  return { Accept: "application/json", "User-Agent": "Calistheni/1.0 (https://calistheni.app)" };
}

function english(value: { en?: string; fi?: string; sv?: string } | undefined) {
  return value?.en?.trim() || value?.fi?.trim() || value?.sv?.trim() || null;
}

function codeForUnit(unit: z.infer<typeof unitSchema>) {
  return (unit.code ?? unit.unit?.code ?? "").toUpperCase();
}

function gramsForUnit(unit: z.infer<typeof unitSchema>) {
  return unit.grams ?? unit.mass ?? unit.value ?? unit.amount;
}

export function mapFineliServings(food: FineliFood): ExternalFoodResult["servings"] {
  const servings: ExternalFoodResult["servings"] = [{ name: "100 g", quantity: 100, grams: 100, householdUnit: "g", sourceExternalId: "G" }];
  for (const unit of food.units) {
    const code = codeForUnit(unit);
    const grams = gramsForUnit(unit);
    if (!code || code === "G" || EXCLUDED_UNIT_CODES.has(code) || !grams || grams <= 0) continue;
    const label = USEFUL_UNIT_LABELS[code] ?? english(unit.name) ?? english(unit.description);
    if (!label || !USEFUL_UNIT_LABELS[code]) continue;
    servings.push({ name: label, quantity: 1, grams, householdUnit: label.toLowerCase(), sourceExternalId: code });
  }
  return servings;
}

function categories(food: FineliFood) {
  return [...food.ingredientClass, ...food.functionClass].map((entry) =>
    english(entry.name) ?? english(entry.description) ?? entry.code
  ).filter(Boolean);
}

function nutrition(food: FineliFood): NutritionValues {
  // Deliberately limited to fields whose Fineli per-100-g mapping is explicit.
  // Fibre and other extended nutrients are not imported in this first pass.
  return validateNutrition({
    caloriesKcal: food.energyKcal,
    proteinGrams: food.protein,
    carbohydrateGrams: food.carbohydrate,
    fatGrams: food.fat,
    // Fineli exposes salt in milligrams per 100 g; Calistheni stores grams.
    saltGrams: food.salt === undefined ? undefined : food.salt / 1000,
    saturatedFatGrams: food.saturatedFat,
    sugarGrams: food.sugar,
  });
}

export function normalizeFineliFood(input: unknown): ExternalFoodResult {
  const food = fineliFoodSchema.parse(input);
  const name = english(food.name);
  const type = food.type.code.toUpperCase();
  if (!name || (type !== "FOOD" && type !== "DISH")) throw new ProviderError("INCOMPLETE_DATA", "Fineli food is missing an English name or supported type.");
  const nutritionPer100g = nutrition(food);
  const isComplete = [nutritionPer100g.caloriesKcal, nutritionPer100g.proteinGrams, nutritionPer100g.carbohydrateGrams, nutritionPer100g.fatGrams].every((value) => value !== undefined);
  if (!isComplete) throw new ProviderError("INCOMPLETE_DATA", "Fineli food does not contain complete primary nutrition.");
  return withChecksum({
    provider: "FINELI" as const,
    externalId: String(food.id),
    foodType: "GENERIC" as const,
    name,
    description: [english(food.type.name) ?? english(food.type.description), ...food.preparationMethod.map((entry) => english(entry.name) ?? english(entry.description))].filter(Boolean).join(" · ") || undefined,
    languageCode: food.name.en ? "en" : food.name.fi ? "fi" : "sv",
    countryCodes: ["fi"],
    nutritionPer100g,
    servings: mapFineliServings(food),
    confidenceScore: type === "FOOD" ? 0.96 : 0.9,
    verificationStatus: "OFFICIAL_SOURCE" as const,
    isComplete: true,
    details: {
      categories: categories(food),
      labels: food.preparationMethod.map((entry) => entry.code),
      allergens: [],
      traces: [],
      additives: [],
      nutrients: [],
    },
    searchMetadata: { source: "FINELI" as const, isGeneric: type === "FOOD", isBranded: false, fineliType: type },
    raw: food,
  });
}

function extractFoods(input: unknown) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    for (const key of ["foods", "content", "results"] as const) {
      if (key in input && Array.isArray((input as Record<string, unknown>)[key])) return (input as Record<string, unknown>)[key] as unknown[];
    }
  }
  throw new ProviderError("INVALID_RESPONSE", "Fineli returned an unsupported food response.");
}

async function responseJson(response: Response) {
  try { return await response.json(); }
  catch { throw new ProviderError("INVALID_RESPONSE", "Fineli did not return JSON."); }
}

export function parseFineliSearchResponse(input: unknown) {
  return extractFoods(input).flatMap((item) => {
    try { return [normalizeFineliFood(item)]; }
    catch { return []; }
  });
}

export function isFineliFood(result: ExternalFoodResult) {
  return result.provider === "FINELI" && result.searchMetadata?.fineliType === "FOOD";
}

export function isFineliDish(result: ExternalFoodResult) {
  return result.provider === "FINELI" && result.searchMetadata?.fineliType === "DISH";
}

const COMPOSITE_TERMS = new Set(["pie", "salad", "sandwich", "soup", "curry", "casserole", "spread", "dip", "sauce", "wrap", "burger", "bowl", "porridge", "bolognese", "burrito"]);
const PREPARATIONS = new Set(["raw", "boiled", "baked", "fried", "grilled", "roasted", "steamed", "dried", "mashed"]);

export function rankFineliFoods(query: string, candidates: ExternalFoodResult[], preferFood = true) {
  const normalizedQuery = normalizeFoodQuery(query);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const compositeIntent = queryWords.some((word) => COMPOSITE_TERMS.has(word));
  const preparations = queryWords.filter((word) => PREPARATIONS.has(word));
  return [...candidates].sort((left, right) => score(right) - score(left) || left.externalId.localeCompare(right.externalId));

  function score(candidate: ExternalFoodResult) {
    const name = normalizeFoodQuery(candidate.name);
    const words = name.split(" ");
    let value = queryWords.filter((word) => words.includes(word) || name.includes(word)).length * 50;
    if (name === normalizedQuery) value += 300;
    else if (name.startsWith(`${normalizedQuery},`) || name.startsWith(`${normalizedQuery} `)) value += 180;
    if (/\baverage\b/.test(name)) value += 140;
    if (preferFood && !compositeIntent) value += isFineliFood(candidate) ? 500 : -500;
    if (compositeIntent) value += isFineliDish(candidate) ? 260 : -80;
    for (const preparation of preparations) if (words.includes(preparation)) value += 160;
    if (!preparations.length && /\braw\b|\bno treatment\b/.test(name + " " + String(candidate.description ?? "").toLowerCase())) value += 25;
    for (const specialization of ["domestic", "imported", "dried", "chips"]) {
      if (words.includes(specialization) && !queryWords.includes(specialization)) value -= 90;
    }
    value -= Math.max(0, name.length - normalizedQuery.length - 22);
    return value;
  }
}

export async function searchFineliFoods(query: string, limit = 12, preferFood = true) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[Fineli] query=${query}`);
  }
  const response = await providerFetch(`${base()}/foods?q=${encodeURIComponent(query)}`, { headers: headers() });
  const candidates = rankFineliFoods(query, parseFineliSearchResponse(await responseJson(response)), preferFood).slice(0, Math.min(limit, 20));
  if (process.env.NODE_ENV === "development") {
    console.info(`[Fineli] candidates=${JSON.stringify(candidates.map((candidate) => ({
      id: candidate.externalId,
      name: candidate.name,
      type: candidate.searchMetadata?.fineliType ?? null,
    })))}`);
  }
  return candidates;
}

export function normalizeFineliId(value: string) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) throw new ProviderError("INVALID_IDENTIFIER", "Fineli food identifiers must be positive integers.");
  return String(Number(value));
}

export async function getFineliFood(id: string) {
  const externalId = normalizeFineliId(id);
  const response = await providerFetch(`${base()}/foods/${encodeURIComponent(externalId)}`, { headers: headers() });
  return normalizeFineliFood(await responseJson(response));
}

/** Official component catalogue, retained for future verified nutrient expansion. */
export async function getFineliComponents() {
  const response = await providerFetch(`${base()}/components/`, { headers: headers() });
  const input = await responseJson(response);
  if (!Array.isArray(input)) throw new ProviderError("INVALID_RESPONSE", "Fineli returned an unsupported component response.");
  return input;
}
