import assert from "node:assert/strict";
import test from "node:test";
import { classifyFoodQuery, deduplicateExternalFoodResults, isRelevantFoodResult, isUsdaGenericFood, limitFoodSearchResults, NUTRITION_SEARCH_RESULT_LIMIT, rankExternalFoodResults, selectPrimaryGenericFood } from "../lib/nutrition/search-ranking.ts";
import { foodResultClassification, meaningfulFoodBrand } from "../lib/nutrition/food-display.ts";
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

test("broad staple searches prefer common prepared forms while explicit raw intent wins", () => {
  const potatoes = [
    food("USDA", "raw-potato", "Potatoes, russet, flesh and skin, raw"),
    food("USDA", "boiled-potato", "Potatoes, boiled, cooked, without skin"),
    food("USDA", "baked-potato", "Potato, baked, flesh and skin"),
    food("USDA", "mashed-potato", "Potatoes, mashed, home-prepared"),
  ];
  assert.notEqual(rankExternalFoodResults("potatoes", potatoes)[0]?.externalId, "raw-potato");
  assert.equal(rankExternalFoodResults("raw potatoes", potatoes)[0]?.externalId, "raw-potato");
  assert.equal(rankExternalFoodResults("boiled potatoes", potatoes)[0]?.externalId, "boiled-potato");

  const rice = [food("USDA", "rice-raw", "Rice, white, raw"), food("USDA", "rice-cooked", "Rice, white, cooked")];
  const pasta = [food("USDA", "pasta-dry", "Pasta, dry"), food("USDA", "pasta-cooked", "Pasta, cooked")];
  const chicken = [food("USDA", "chicken-raw", "Chicken breast, raw"), food("USDA", "chicken-cooked", "Chicken breast, roasted, cooked")];
  assert.equal(rankExternalFoodResults("rice", rice)[0]?.externalId, "rice-cooked");
  assert.equal(rankExternalFoodResults("pasta", pasta)[0]?.externalId, "pasta-cooked");
  assert.equal(rankExternalFoodResults("chicken breast", chicken)[0]?.externalId, "chicken-cooked");
  assert.equal(rankExternalFoodResults("raw chicken breast", chicken)[0]?.externalId, "chicken-raw");
});

test("naturally raw foods remain sensible generic matches instead of desserts or products", () => {
  const bananas = [
    food("USDA", "banana-raw", "Banana, raw"),
    food("USDA", "banana-split", "Banana split"),
    food("USDA", "banana-chips", "Banana chips"),
    food("OPEN_FOOD_FACTS", "banana-product", "Banana pudding", { brandName: "Dessert Co" }),
  ];
  const apples = [food("USDA", "apple-raw", "Apple, raw"), food("USDA", "apple-pie", "Apple pie")];
  assert.equal(rankExternalFoodResults("banana", bananas)[0]?.externalId, "banana-raw");
  assert.equal(rankExternalFoodResults("apple", apples)[0]?.externalId, "apple-raw");
});

test("result limits apply after ranked categories and retain deterministic source-safe ordering", () => {
  const genericResults = Array.from({ length: 18 }, (_, index) => ({ id: `g-${index}` }));
  const localResults = Array.from({ length: 8 }, (_, index) => ({ id: `l-${index}` }));
  const packagedResults = Array.from({ length: 8 }, (_, index) => ({ id: `p-${index}` }));
  const limited = limitFoodSearchResults({ genericResults, localResults, packagedResults });
  assert.equal(limited.genericResults.length + limited.localResults.length + limited.packagedResults.length, NUTRITION_SEARCH_RESULT_LIMIT);
  assert.deepEqual(limited.genericResults.map((item) => item.id), genericResults.slice(0, 15).map((item) => item.id));
  assert.deepEqual(limited.localResults.map((item) => item.id), []);
  assert.deepEqual(limited.packagedResults.map((item) => item.id), ["p-0", "p-1", "p-2", "p-3", "p-4"]);
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

test("keeps useful food classifications without displaying provider credit or placeholder brands", () => {
  assert.equal(foodResultClassification({ isLocal: true }), "Saved food");
  assert.equal(foodResultClassification({ provider: "USDA", searchMetadata: { isBranded: false } }), "Generic food");
  assert.equal(foodResultClassification({ provider: "USDA", brandName: "NOT A BRANDED ITEM", searchMetadata: { isBranded: false } }), "Generic food");
  assert.equal(foodResultClassification({ provider: "USDA", searchMetadata: { isBranded: true } }), "Packaged product");
  assert.equal(foodResultClassification({ provider: "OPEN_FOOD_FACTS" }), "Packaged product");
  assert.equal(meaningfulFoodBrand("NOT A BRANDED ITEM", "Salmon"), null);
  assert.equal(meaningfulFoodBrand("N/A", "Apple"), null);
  assert.equal(meaningfulFoodBrand("GENERIC", "Apple"), null);
  assert.equal(meaningfulFoodBrand("Coca-Cola", "Coca-Cola Zero"), "Coca-Cola");
});

test("search UI keeps request identity, aborts stale work, and renders generic before packaged sections", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionFoodSearch.tsx", import.meta.url), "utf8"));
  const page = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/nutrition/foods/page.tsx", import.meta.url), "utf8"));
  assert.match(source, /abortController\.current\?\.abort\(\)/);
  assert.match(source, /activeRequest\.current === requestId/);
  assert.match(source, /search\(query\)/);
  assert.match(source, /foodResultClassification/);
  assert.doesNotMatch(source, /Generic food · USDA/);
  assert.doesNotMatch(source, /Packaged product · USDA/);
  assert.doesNotMatch(source, /Packaged product · Open Food Facts/);
  assert.match(source, /genericResults/);
  assert.match(source, /Packaged products/);
  assert.match(source, /Updating results/);
  assert.match(page, /Nutrition data sources and terms/);
  assert.match(page, /\/nutrition\/data-sources/);
});

test("tracker picker keeps search controls outside a bounded shadcn result scroller", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8"));
  assert.match(source, /NUTRITION_SEARCH_RESULT_LIMIT/);
  assert.match(source, /<ScrollArea className="h-\[min\(48dvh,26rem\)\] rounded-lg border"/);
  assert.match(source, /aria-label="Food search results"/);
  assert.match(source, /No foods found\. Try a more specific search\./);
});
