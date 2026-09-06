import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  foldFoodQueryAccents,
  foodSearchIndexKeys,
  normalizeFoodQuery,
  nutritionFoodQueryVariants,
} from "../lib/nutrition/normalization.ts";
import { buildOpenFoodFactsAliasCandidates } from "../lib/nutrition/open-food-facts-aliases.ts";
import { buildProviderFoodAliasCandidates, extractFineliLocalizedNames } from "../lib/nutrition/provider-food-aliases.ts";
import { eligibleRemoteFoodProviders, FOOD_PROVIDER_CAPABILITIES, localFoodSearchSufficiency, searchEligibleRemoteFoodProviders } from "../lib/nutrition/provider-capabilities.ts";
import {
  extractOpenFoodFactsAliases,
  extractOpenFoodFactsLocalizedNames,
  normalizeOpenFoodFactsProduct,
  openFoodFactsSearchUrl,
  parseOpenFoodFactsSearchResponse,
  searchOpenFoodFactsFoods,
} from "../lib/nutrition/providers/open-food-facts.ts";
import {
  isRelevantFoodResult,
  isRelevantNutritionFoodCandidate,
  deduplicateExternalFoodResults,
  rankNutritionFoodCandidates,
  selectNutritionFoodCandidate,
} from "../lib/nutrition/search-ranking.ts";
import type { ExternalFoodResult, FoodSummary } from "../lib/nutrition/types.ts";

const root = new URL("../", import.meta.url);
const nutriments = {
  "energy-kcal_100g": 300,
  proteins_100g: 20,
  carbohydrates_100g: 2,
  fat_100g: 24,
};
const nutritionPer100g = {
  caloriesKcal: 300,
  proteinGrams: 20,
  carbohydrateGrams: 2,
  fatGrams: 24,
};

test("primary normalization preserves Unicode while an accent-folded fallback remains available", () => {
  assert.equal(normalizeFoodQuery("  ЛУКАНКА  "), "луканка");
  assert.equal(normalizeFoodQuery("Crème  brûlée"), "crème brûlée");
  assert.equal(normalizeFoodQuery("KÄSE"), "käse");
  assert.equal(normalizeFoodQuery("σουβλάκι"), "σουβλάκι");
  assert.equal(normalizeFoodQuery("ЧАЙ"), "чай");
  assert.equal(foldFoodQueryAccents("Crème"), "creme");
  assert.deepEqual(foodSearchIndexKeys("Crème"), ["crème", "creme"]);
  assert.equal(foodSearchIndexKeys("Чай")[0], "чай");
  assert.deepEqual(nutritionFoodQueryVariants("crème"), ["crème", "creme"]);
});

test("OFF localized-name extraction is dynamic and creates deduplicated brand combinations", () => {
  const raw = {
    code: "3800000000001",
    product_name: "Lukanka",
    product_name_bg: "Луканка",
    product_name_de: "Lukanka-Wurst",
    generic_name_es: "Embutido curado",
    brands: "Маджаров",
    lang: "en",
    nutriments,
  };
  assert.deepEqual(extractOpenFoodFactsLocalizedNames(raw), [
    { name: "Lukanka", languageCode: "en" },
    { name: "Луканка", languageCode: "bg" },
    { name: "Lukanka-Wurst", languageCode: "de" },
    { name: "Embutido curado", languageCode: "es" },
  ]);
  const aliases = extractOpenFoodFactsAliases(raw);
  assert.ok(aliases.some((alias) => alias.name === "Луканка" && alias.languageCode === "bg"));
  assert.ok(aliases.some((alias) => alias.name === "Маджаров Луканка"));
  assert.equal(new Set(aliases.map((alias) => normalizeFoodQuery(alias.name))).size, aliases.length);

  const normalized = normalizeOpenFoodFactsProduct(raw, "луканка");
  assert.equal(normalized.name, "Луканка");
  assert.equal(normalized.externalId, "3800000000001");
});

test("Bulgarian aliases rank exact, prefix, token, uppercase, and brand queries without duplicate foods", () => {
  const food = {
    provider: "OPEN_FOOD_FACTS" as const,
    externalId: "3800000000001",
    foodType: "BRANDED" as const,
    name: "Lukanka",
    brandName: "Маджаров",
    localizedNames: [
      { name: "Луканка", languageCode: "bg" },
      { name: "Маджаров Луканка", languageCode: "bg" },
    ],
    countryCodes: [],
    nutritionPer100g,
    servings: [],
    confidenceScore: 0.8,
    verificationStatus: "COMMUNITY_SOURCE" as const,
    isComplete: true,
    checksum: "fixture",
    raw: {},
  } satisfies ExternalFoodResult;
  const unrelated = { ...food, externalId: "2", name: "Салам", localizedNames: [] };

  for (const query of ["луканка", "ЛУКАНКА", "лукан", "маджаров луканка"]) {
    assert.equal(rankNutritionFoodCandidates(query, [unrelated, food])[0]?.externalId, food.externalId, query);
    assert.equal(isRelevantFoodResult(query, food), true, query);
  }
});

test("user-created Cyrillic and accented Latin canonical names remain searchable candidates", () => {
  const banitsa = {
    id: "user-banitsa",
    source: "USER",
    sourceExternalId: "community:домашна баница",
    type: "USER_CREATED",
    isLocal: true,
    name: "Домашна баница",
    verificationStatus: "UNVERIFIED",
  } as FoodSummary;
  const creme = {
    ...banitsa,
    id: "user-creme",
    sourceExternalId: "community:crème",
    name: "Crème fraîche",
  };
  assert.equal(rankNutritionFoodCandidates("баница", [banitsa])[0]?.id, "user-banitsa");
  assert.equal(rankNutritionFoodCandidates("crème", [creme])[0]?.id, "user-creme");
  assert.equal(rankNutritionFoodCandidates("creme", [creme])[0]?.id, "user-creme");
});

test("raw OFF alias backfill planning is stable and accent-deduplicated", () => {
  const input = {
    rawData: {
      product_name: "Crème",
      product_name_fr: "Crème",
      product_name_bg: "Крем",
      brands: "Марка",
      lang: "fr",
    },
    fallbackName: "Crème",
    fallbackLanguageCode: "fr",
  };
  const first = buildOpenFoodFactsAliasCandidates(input);
  const second = buildOpenFoodFactsAliasCandidates(input);
  assert.deepEqual(second, first);
  assert.equal(first.filter((alias) => alias.normalizedName === "creme").length, 1);
  assert.ok(first.some((alias) => alias.name === "Крем"));
});

test("Fineli provider aliases index every available EN/FI/SV name without duplicating the food", () => {
  const rawData = { name: { en: "HONEY", fi: "HUNAJA", sv: "HONUNG" } };
  assert.deepEqual(extractFineliLocalizedNames(rawData), [
    { name: "HONEY", languageCode: "en" },
    { name: "HUNAJA", languageCode: "fi" },
    { name: "HONUNG", languageCode: "sv" },
  ]);
  const aliases = buildProviderFoodAliasCandidates({ provider: "FINELI", rawData, fallbackName: "Honey", fallbackLanguageCode: "en" });
  assert.ok(aliases.some((alias) => alias.normalizedName === "hunaja" && alias.languageCode === "fi"));
  assert.ok(aliases.some((alias) => alias.normalizedName === "honung" && alias.languageCode === "sv"));
  assert.equal(new Set(aliases.map((alias) => alias.normalizedName)).size, aliases.length);
});

test("provider eligibility uses search capability and two local matches still allow OFF enrichment", () => {
  const local = ["one", "two"].map((id) => ({
    id, source: "OPEN_FOOD_FACTS", sourceExternalId: id, type: "BRANDED", isLocal: true,
    name: "Луканка", localizedNames: [{ name: "Луканка", languageCode: "bg" }], brandName: null,
  })) as FoodSummary[];
  const sufficiency = localFoodSearchSufficiency("луканка", local, 20);
  assert.equal(sufficiency.strongResultCount, 2);
  assert.equal(sufficiency.sufficient, false);
  assert.deepEqual(eligibleRemoteFoodProviders({ query: "луканка", queryKind: "GENERIC", localSufficient: sufficiency.sufficient, configured: { FINELI: true, USDA: true, OPEN_FOOD_FACTS: true } }), ["OPEN_FOOD_FACTS"]);
  assert.deepEqual(eligibleRemoteFoodProviders({ query: "cheese", queryKind: "GENERIC", localSufficient: false, configured: { USDA: true, OPEN_FOOD_FACTS: true } }), ["USDA", "OPEN_FOOD_FACTS"]);
  assert.deepEqual(eligibleRemoteFoodProviders({ query: "лу", queryKind: "GENERIC", localSufficient: false, configured: { USDA: true, OPEN_FOOD_FACTS: true } }), []);
  assert.equal(FOOD_PROVIDER_CAPABILITIES.FINELI.localDataset, true);
  assert.equal(FOOD_PROVIDER_CAPABILITIES.FINELI.remoteSearch, false);
});

test("accent fallback respects word boundaries instead of matching inside unrelated localized words", () => {
  const cheese = { name: "Cheese", localizedNames: [{ name: "Käse", languageCode: "de" }] };
  const flatbread = { name: "Flatbread", localizedNames: [{ name: "Perunarieskaset", languageCode: "fi" }] };
  assert.equal(isRelevantNutritionFoodCandidate("käse", cheese), true);
  assert.equal(isRelevantNutritionFoodCandidate("käse", flatbread), false);
});

test("twenty strong local matches skip remote cost while local OFF and remote OFF deduplicate", () => {
  const fullLocal = Array.from({ length: 20 }, (_, index) => ({
    id: `local-${index}`, source: "FINELI", sourceExternalId: String(index), type: "GENERIC", isLocal: true,
    name: `Omena ${index}`, localizedNames: [{ name: `Omena ${index}`, languageCode: "fi" }], brandName: null, nutritionPer100g: {},
  })) as FoodSummary[];
  assert.equal(localFoodSearchSufficiency("omena", fullLocal, 20).sufficient, true);
  assert.deepEqual(eligibleRemoteFoodProviders({ query: "omena", queryKind: "GENERIC", localSufficient: true, configured: { USDA: true, OPEN_FOOD_FACTS: true } }), []);

  const localOff = { ...fullLocal[0], source: "OPEN_FOOD_FACTS", sourceExternalId: "3800000000001", barcode: "3800000000001", name: "Луканка" } as FoodSummary;
  const duplicate = { provider: "OPEN_FOOD_FACTS", externalId: "3800000000001", barcode: "3800000000001", name: "Луканка", brandName: undefined, nutritionPer100g: {}, servings: [] } as unknown as ExternalFoodResult;
  assert.deepEqual(deduplicateExternalFoodResults([localOff], [duplicate]), []);
});

test("one remote provider failure does not discard another provider's results", async () => {
  const usdaResult = { provider: "USDA", externalId: "1", name: "Fixture" } as ExternalFoodResult;
  const calls = await searchEligibleRemoteFoodProviders({
    providers: ["USDA", "OPEN_FOOD_FACTS"],
    queries: ["сирене"],
    limit: 50,
    searchers: {
      USDA: async () => [usdaResult],
      OPEN_FOOD_FACTS: async () => { throw new Error("provider unavailable"); },
    },
  });
  assert.equal(calls.USDA?.[0]?.status, "fulfilled");
  assert.deepEqual(calls.USDA?.[0]?.status === "fulfilled" ? calls.USDA[0].value : [], [usdaResult]);
  assert.equal(calls.OPEN_FOOD_FACTS?.[0]?.status, "rejected");
});

test("OFF full-text search preserves Unicode, searches localized fields, and keeps an unseen remote candidate", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ hits: [{
      code: "3800000000001",
      product_name: "Lukanka",
      product_name_bg: "Луканка",
      brands: ["Маджаров"],
      lang: "en",
      nutriments,
    }], count: 1, timed_out: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const results = await searchOpenFoodFactsFoods("луканка", 8);
    const url = new URL(requestedUrl);
    assert.equal(url.origin, "https://search.openfoodfacts.org");
    assert.equal(url.pathname, "/search");
    assert.equal(url.searchParams.get("q"), "луканка");
    assert.match(url.searchParams.get("langs") ?? "", /(?:^|,)bg(?:,|$)/);
    assert.equal(url.searchParams.get("boost_phrase"), "true");
    assert.equal(results[0]?.name, "Луканка");
    assert.equal("id" in (results[0] ?? {}), false);
    assert.match(JSON.stringify(results[0]), /3800000000001/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OFF search parsing distinguishes a zero-result response from a provider error", async () => {
  assert.deepEqual(parseOpenFoodFactsSearchResponse({ hits: [], count: 0, timed_out: false }, "луканка"), {
    foods: [], rawCount: 0, parsedCount: 0, rejectedCount: 0, providerCount: 0, timedOut: false,
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(searchOpenFoodFactsFoods("луканка"), (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && error.code === "UNAVAILABLE" && "httpStatus" in error && error.httpStatus === 503)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OFF full-text hits rediscover known and unseen Bulgarian products and dynamic DE/FR/ES names", () => {
  const response = parseOpenFoodFactsSearchResponse({ hits: [
    { code: "3800202641806", product_name: "Джумайска луканка", product_name_bg: "Джумайска Луканка", brands: ["Молерите"], lang: "bg", nutriments },
    { code: "3800047763565", product_name: "Луканка Добруджанска", product_name_bg: "Луканка Добруджанска", brands: ["Орехите"], lang: "bg", nutriments },
    { code: "4000000000001", product_name: "Cheese", product_name_de: "Käse", generic_name_fr: "Fromage", generic_name_es: "Queso", brands: ["Fixture"], lang: "en", nutriments },
  ], count: 3, timed_out: false }, "луканка");
  assert.equal(response.rawCount, 3);
  assert.equal(response.parsedCount, 3);
  assert.equal(response.rejectedCount, 0);
  assert.ok(response.foods.some((food) => food.externalId === "3800202641806" && isRelevantFoodResult("луканка", food)));
  const unseen = response.foods.find((food) => food.externalId === "3800047763565");
  assert.ok(unseen && !("id" in unseen) && isRelevantFoodResult("луканка", unseen));
  const multilingual = response.foods.find((food) => food.externalId === "4000000000001");
  assert.ok(multilingual && isRelevantFoodResult("käse", multilingual));
  assert.ok(multilingual && isRelevantFoodResult("fromage", multilingual));
  assert.ok(multilingual && isRelevantFoodResult("queso", multilingual));
  assert.match(openFoodFactsSearchUrl("jamón", 50).searchParams.get("langs") ?? "", /(?:^|,)es(?:,|$)/);
});

test("irrelevant USDA candidates are rejected before provider merge", () => {
  const irrelevant = {
    provider: "USDA", externalId: "1", foodType: "GENERIC", name: "Pork sausage", countryCodes: [],
    nutritionPer100g: {}, servings: [], confidenceScore: 0.9, verificationStatus: "OFFICIAL_SOURCE",
    isComplete: true, checksum: "x", raw: {},
  } as ExternalFoodResult;
  assert.equal(isRelevantFoodResult("луканка", irrelevant), false);
});

test("English generic ranking, barcode reuse, and AI canonical selection stay intact", async () => {
  const generic = {
    provider: "USDA" as const,
    externalId: "banana",
    name: "Banana, raw",
    foodType: "GENERIC" as const,
    countryCodes: [],
    nutritionPer100g: {},
    servings: [],
    confidenceScore: 0.9,
    verificationStatus: "OFFICIAL_SOURCE" as const,
    isComplete: true,
    checksum: "banana",
    raw: { dataType: "Foundation" },
  } satisfies ExternalFoodResult;
  const packaged = { ...generic, provider: "OPEN_FOOD_FACTS" as const, externalId: "pudding", name: "Banana pudding", foodType: "BRANDED" as const, brandName: "Example" };
  assert.equal(rankNutritionFoodCandidates("banana", [packaged, generic])[0]?.externalId, "banana");
  assert.equal(selectNutritionFoodCandidate("banana", [packaged, generic])?.externalId, "banana");

  const [service, barcodeRoute, aiMatching] = await Promise.all([
    readFile(new URL("lib/nutrition/service.ts", root), "utf8"),
    readFile(new URL("app/api/nutrition/foods/barcode/[barcode]/route.ts", root), "utf8"),
    readFile(new URL("lib/nutrition/ai-meal-food-matching.ts", root), "utf8"),
  ]);
  assert.ok(service.indexOf("source_sourceExternalId") < service.indexOf("fetchExternal(provider, externalId)"));
  assert.ok(barcodeRoute.indexOf("prisma.food.findUnique") < barcodeRoute.indexOf("getOpenFoodFactsProduct(barcode)"));
  assert.match(aiMatching, /selectAiMealFoodCandidate/);
});

test("the service searches aliases locally and enriches through capability-selected providers", async () => {
  const service = await readFile(new URL("lib/nutrition/service.ts", root), "utf8");
  assert.match(service, /aliases: \{ some: \{ normalizedName: \{ contains: term \} \} \}/);
  assert.match(service, /localFoodSearchSufficiency\(normalized, localResults, NUTRITION_SEARCH_RESULT_LIMIT\)/);
  assert.match(service, /eligibleRemoteFoodProviders/);
  assert.doesNotMatch(service, /hasNonAsciiText/);
  assert.match(service, /Promise\.allSettled/);
});
