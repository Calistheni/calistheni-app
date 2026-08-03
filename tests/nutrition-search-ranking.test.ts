import assert from "node:assert/strict";
import test from "node:test";
import { classifyFoodQuery, deduplicateExternalFoodResults, isRelevantFoodResult, isUsdaGenericFood, rankExternalFoodResults, selectPrimaryGenericFood } from "../lib/nutrition/search-ranking.ts";
import type { ExternalFoodResult, FoodSummary } from "../lib/nutrition/types.ts";

function food(provider: "USDA" | "OPEN_FOOD_FACTS", externalId: string, name: string, options: Partial<ExternalFoodResult> = {}): ExternalFoodResult {
  return {
    provider, externalId, name, foodType: provider === "USDA" ? "GENERIC" : "BRANDED", countryCodes: [], nutritionPer100g: { caloriesKcal: 50, proteinGrams: 0.3, carbohydrateGrams: 14, fatGrams: 0.2 }, servings: [], confidenceScore: 0.98, verificationStatus: provider === "USDA" ? "OFFICIAL_SOURCE" : "COMMUNITY_SOURCE", isComplete: true, checksum: externalId, raw: provider === "USDA" ? { dataType: "Foundation" } : {}, ...options,
  };
}

test("classifies generic, variant, product, and barcode queries deterministically", () => {
  assert.equal(classifyFoodQuery("apple"), "GENERIC");
  assert.equal(classifyFoodQuery("chicken breast"), "GENERIC");
  assert.equal(classifyFoodQuery("apple juice"), "SPECIFIC_VARIANT");
  assert.equal(classifyFoodQuery("Coca-Cola Zero 330 ml"), "PRODUCT");
  assert.equal(classifyFoodQuery("4823077625626"), "BARCODE");
});

test("uses USDA structured metadata rather than the word generic to classify products", () => {
  assert.equal(isUsdaGenericFood(food("USDA", "foundation", "Broccoli, raw", { raw: { dataType: "Foundation" } })), true);
  assert.equal(isUsdaGenericFood(food("USDA", "legacy", "Broccoli, raw", { raw: { dataType: "SR Legacy" } })), true);
  assert.equal(isUsdaGenericFood(food("USDA", "brand", "Generic Broccoli", { raw: { dataType: "Branded" }, brandName: "Generic Foods", foodType: "BRANDED" })), false);
  assert.equal(isUsdaGenericFood(food("USDA", "owner", "Broccoli", { raw: { dataType: "Foundation" }, brandName: "Generic Farms" })), false);
});

test("promotes the basic USDA generic food and retains variants below it", () => {
  const apple = food("USDA", "1", "Apple, raw", { raw: { dataType: "Foundation" } });
  const candidates = [
    food("OPEN_FOOD_FACTS", "off", "Apple slices snack", { brandName: "Snack Co" }),
    food("USDA", "2", "Apple, dried"), food("USDA", "3", "Apples, canned, sweetened"), food("USDA", "4", "Apple juice"), apple,
  ];
  const ranked = rankExternalFoodResults("apple", candidates);
  assert.equal(ranked[0]?.name, "Apple, raw");
  assert.equal(selectPrimaryGenericFood("apple", ranked)?.externalId, "1");
  assert.ok(ranked.findIndex((item) => item.externalId === "off") > ranked.findIndex((item) => item.externalId === "1"));
});

test("generic USDA records lead generic staples while product searches elevate exact packaged results", () => {
  for (const query of ["egg", "salmon", "chicken breast", "rice", "banana", "greek yogurt"]) {
    const generic = food("USDA", `${query}-generic`, `${query}, raw`, { raw: { dataType: "SR Legacy" } });
    const packaged = food("OPEN_FOOD_FACTS", `${query}-packaged`, `${query} product`, { brandName: "Example Brand" });
    assert.equal(rankExternalFoodResults(query, [packaged, generic])[0]?.externalId, generic.externalId, query);
  }
  const soda = food("OPEN_FOOD_FACTS", "coke", "Coca-Cola Zero Sugar 330 ml", { brandName: "Coca-Cola" });
  const generic = food("USDA", "soda", "Cola flavored beverage");
  assert.equal(rankExternalFoodResults("Coca-Cola Zero 330 ml", [generic, soda])[0]?.externalId, "coke");
});

test("deduplicates only clear source or identical previews while keeping distinct preparations", () => {
  const local = [{ source: "USDA", sourceExternalId: "raw", name: "Apple, raw", brandName: null, nutritionPer100g: { caloriesKcal: 50, proteinGrams: 0.3, carbohydrateGrams: 14, fatGrams: 0.2 }, id: "local" }] as FoodSummary[];
  const raw = food("USDA", "raw", "Apple, raw");
  const duplicate = food("USDA", "duplicate", "Apple, raw");
  const dried = food("USDA", "dried", "Apple, dried");
  const remaining = deduplicateExternalFoodResults(local, [raw, duplicate, dried]);
  assert.deepEqual(remaining.map((item) => item.externalId), ["dried"]);
});

test("filters unrelated loose provider matches while preserving singular and plural food matches", () => {
  assert.equal(isRelevantFoodResult("broccoli", food("USDA", "broccoli", "Broccoli, raw")), true);
  assert.equal(isRelevantFoodResult("apples", food("USDA", "apple", "Apple, raw")), true);
  assert.equal(isRelevantFoodResult("broccoli", food("USDA", "zyrtec", "Generic Zyrtec")), false);
  assert.equal(isRelevantFoodResult("apple", food("USDA", "crab", "Surumi / Crab Flavoured Nuggets")), false);
});

test("search UI keeps request identity, aborts stale work, and renders generic before packaged sections", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionFoodSearch.tsx", import.meta.url), "utf8"));
  assert.match(source, /abortController\.current\?\.abort\(\)/);
  assert.match(source, /activeRequest\.current === requestId/);
  assert.match(source, /search\(query\)/);
  assert.match(source, /resultSourceLabel/);
  assert.match(source, /genericResults/);
  assert.match(source, /Packaged products/);
  assert.match(source, /Updating results/);
});
