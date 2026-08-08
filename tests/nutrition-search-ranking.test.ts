import assert from "node:assert/strict";
import test from "node:test";
import { nutritionFoodQueryVariants } from "../lib/nutrition/normalization.ts";
import { classifyFoodQuery, deduplicateExternalFoodResults, diversifyNutritionFoodCandidates, isRelevantFoodResult, isSufficientNutritionFoodCandidate, isUsdaGenericFood, limitFoodSearchResults, NUTRITION_SEARCH_RESULT_LIMIT, rankExternalFoodResults, rankNutritionFoodCandidates, selectNutritionFoodCandidate, selectPrimaryGenericFood } from "../lib/nutrition/search-ranking.ts";
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

test("plain milk and honey rank generic staples ahead of derivatives while explicit milk intent wins", () => {
  const milk = [
    food("USDA", "whole", "Milk, whole, 3.25% milkfat"),
    food("USDA", "reduced", "Milk, reduced fat, 2% milkfat"),
    food("USDA", "skim", "Milk, nonfat (skim)"),
    food("USDA", "coconut", "Coconut milk"),
    food("OPEN_FOOD_FACTS", "shake", "Vanilla milkshake", { brandName: "Example" }),
  ];
  assert.equal(rankNutritionFoodCandidates("milk", milk)[0]?.externalId, "whole");
  assert.equal(rankNutritionFoodCandidates("coconut milk", milk)[0]?.externalId, "coconut");
  assert.equal(rankNutritionFoodCandidates("skim milk", milk)[0]?.externalId, "skim");
  assert.equal(rankNutritionFoodCandidates("almond milk", [...milk, food("USDA", "almond", "Almond milk")])[0]?.externalId, "almond");

  const honey = [
    food("USDA", "honey", "Honey"),
    food("USDA", "mustard", "Honey mustard"),
    food("OPEN_FOOD_FACTS", "cereal", "Honey cereal", { brandName: "Example" }),
  ];
  assert.equal(rankNutritionFoodCandidates("honey", honey)[0]?.externalId, "honey");
});

test("an insufficient local derivative does not prevent provider generic fallback", async () => {
  const service = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8"));
  const localCoconutMilk = {
    id: "local-coconut", source: "USDA", sourceExternalId: "coconut", type: "GENERIC", isLocal: true,
    name: "Coconut milk",
  } as FoodSummary;
  const providerWholeMilk = food("USDA", "whole-provider", "Milk, whole");
  const ranked = rankNutritionFoodCandidates("milk", [localCoconutMilk, providerWholeMilk]);
  assert.equal(ranked[0]?.name, "Milk, whole");
  assert.equal(isSufficientNutritionFoodCandidate("milk", localCoconutMilk), false);
  assert.equal(isSufficientNutritionFoodCandidate("milk", { ...localCoconutMilk, name: "Milkshake" }), false);
  assert.match(service, /searchUsdaFoods\(normalized, NUTRITION_PROVIDER_CANDIDATE_LIMIT\)/);
  assert.match(service, /searchOpenFoodFactsFoods\(normalized, NUTRITION_PROVIDER_CANDIDATE_LIMIT\)/);
  assert.match(service, /const localResults = local\.status === "fulfilled" \? local\.value : \[\]/);
  assert.match(service, /diversifyNutritionFoodCandidates\(rankedResults\)\.slice\(0, NUTRITION_SEARCH_RESULT_LIMIT\)/);
});

test("Describe and AI use the exact same generic winner as the Food search regression", () => {
  const oats = [food("USDA", "oats-raw", "Oats, raw"), food("USDA", "oatmeal", "Oatmeal, cooked")];
  const bananas = [food("USDA", "banana-raw", "Banana, raw"), food("USDA", "banana-nectar", "Banana nectar"), food("OPEN_FOOD_FACTS", "banana-pudding", "Banana pudding", { brandName: "Dessert Co" })];
  const watermelon = [food("USDA", "watermelon-raw", "Watermelon, raw"), food("OPEN_FOOD_FACTS", "fini-watermelon", "Fini Roller Watermelon 20g", { brandName: "Fini" })];
  const concepts = [{ query: "oats", candidates: oats }, { query: "banana", candidates: bananas }, { query: "watermelon", candidates: watermelon }];
  const selected = concepts.map(({ query, candidates }) => selectNutritionFoodCandidate(query, candidates)?.externalId);
  assert.deepEqual(selected, ["oatmeal", "banana-raw", "watermelon-raw"]);
  assert.notEqual(selected[1], "banana-nectar");
  assert.notEqual(selected[2], "fini-watermelon");
});

test("generic cinnamon spice outranks cinnamon dishes and branded products", () => {
  const cinnamon = [
    food("USDA", "ground", "Cinnamon, ground"),
    food("USDA", "sticks", "Cinnamon, spice"),
    food("USDA", "roll", "Cinnamon roll"),
    food("USDA", "dessert", "Cinnamon dessert"),
    food("OPEN_FOOD_FACTS", "cereal", "Cinnamon cereal", { brandName: "Example" }),
  ];
  assert.equal(rankNutritionFoodCandidates("cinnamon", cinnamon)[0]?.externalId, "ground");
  assert.equal(selectNutritionFoodCandidate("cinnamon", cinnamon)?.externalId, "ground");
  assert.equal(rankNutritionFoodCandidates("cinnamon roll", cinnamon)[0]?.externalId, "roll");
});

test("manual, Describe, and AI canonical resolution share ordered generic candidates", () => {
  const cases = [
    ["banana", [food("USDA", "banana", "Banana, raw"), food("USDA", "nectar", "Banana nectar")]],
    ["watermelon", [food("USDA", "watermelon", "Watermelon, raw"), food("OPEN_FOOD_FACTS", "candy", "Watermelon candy", { brandName: "Fini" })]],
    ["potatoes", [food("USDA", "boiled", "Potatoes, boiled"), food("USDA", "raw", "Potatoes, raw")]],
    ["rice", [food("USDA", "cooked", "Rice, white, cooked"), food("USDA", "raw", "Rice, white, raw")]],
    ["milk", [food("USDA", "whole-milk", "Milk, whole"), food("USDA", "skim-milk", "Milk, skim"), food("USDA", "coconut-milk", "Coconut milk")]],
    ["cinnamon", [food("USDA", "ground-cinnamon", "Cinnamon, ground"), food("USDA", "cinnamon-roll", "Cinnamon roll"), food("OPEN_FOOD_FACTS", "cinnamon-cereal", "Cinnamon cereal", { brandName: "Example" })]],
    ["honey", [food("USDA", "generic-honey", "Honey"), food("USDA", "honey-mustard", "Honey mustard"), food("OPEN_FOOD_FACTS", "honey-cereal", "Honey cereal", { brandName: "Example" })]],
  ] as const;

  for (const [query, candidates] of cases) {
    const manualTop = rankNutritionFoodCandidates(query, candidates)[0]?.externalId;
    const describeTop = selectNutritionFoodCandidate(query, candidates)?.externalId;
    const aiTop = selectNutritionFoodCandidate(query, candidates)?.externalId;
    assert.equal(describeTop, manualTop, `${query} Describe parity`);
    assert.equal(aiTop, manualTop, `${query} AI parity`);
  }
});

test("generic labels reject branded or processed-only weak matches instead of importing them", () => {
  const weakWatermelon = [food("OPEN_FOOD_FACTS", "fini", "Fini Roller Watermelon 20g", { brandName: "Fini" })];
  assert.equal(selectNutritionFoodCandidate("watermelon", weakWatermelon), null);
  assert.equal(selectNutritionFoodCandidate("Fini watermelon roller", weakWatermelon)?.externalId, "fini");
  const potatoes = [food("USDA", "raw", "Potatoes, raw"), food("USDA", "boiled", "Potatoes, boiled, cooked")];
  assert.equal(selectNutritionFoodCandidate("potatoes", potatoes)?.externalId, rankNutritionFoodCandidates("potatoes", potatoes)[0]?.externalId);
  assert.equal(selectNutritionFoodCandidate("raw potatoes", potatoes)?.externalId, "raw");
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

test("display diversity keeps useful milk variants instead of an unbounded duplicate run", () => {
  const candidates = [
    ...Array.from({ length: 6 }, (_, index) => food("USDA", `whole-${index}`, `Milk, whole variant ${index}`)),
    food("USDA", "coconut", "Coconut milk"),
    food("USDA", "almond", "Almond milk"),
  ];
  const visible = diversifyNutritionFoodCandidates(rankNutritionFoodCandidates("milk", candidates));
  assert.equal(visible.filter((food) => food.name.startsWith("Milk,")).length, 4);
  assert.ok(visible.some((food) => food.externalId === "coconut"));
  assert.ok(visible.some((food) => food.externalId === "almond"));
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

test("local canonical matches win Describe resolution and plural lookup remains conservative", () => {
  const localMilk = {
    id: "milk-local", source: "USDA", sourceExternalId: "milk", type: "GENERIC", isLocal: true,
    name: "Milk, whole", brandName: null,
  } as FoodSummary;
  const localHoney = {
    id: "honey-local", source: "USDA", sourceExternalId: "honey", type: "GENERIC", isLocal: true,
    name: "Honey", brandName: null,
  } as FoodSummary;
  const providerMilk = food("USDA", "milk-provider", "Milk, whole");
  const providerHoney = food("OPEN_FOOD_FACTS", "honey-product", "Honey drink", { brandName: "Example" });
  const milkWinner = selectNutritionFoodCandidate("milk", [providerMilk, localMilk]);
  const honeyWinner = selectNutritionFoodCandidate("honey", [providerHoney, localHoney]);
  assert.ok(milkWinner && "id" in milkWinner);
  assert.ok(honeyWinner && "id" in honeyWinner);
  assert.equal(milkWinner.id, "milk-local");
  assert.equal(honeyWinner.id, "honey-local");
  assert.equal(selectNutritionFoodCandidate("milk", [{ id: "milkshake", source: "USDA", sourceExternalId: "milkshake", type: "GENERIC", isLocal: true, name: "Milkshake" } as FoodSummary]), null);
  assert.deepEqual(nutritionFoodQueryVariants("potatoes"), ["potatoes", "potato"]);
  assert.deepEqual(nutritionFoodQueryVariants("berries"), ["berries", "berry"]);
});

test("oats with milk cinnamon honey and banana keeps every obvious ingredient canonical", () => {
  const concepts = [
    ["oats", { id: "oats", source: "USDA", sourceExternalId: "oats", type: "GENERIC", isLocal: true, name: "Oatmeal, cooked" }],
    ["milk", { id: "milk", source: "USDA", sourceExternalId: "milk", type: "GENERIC", isLocal: true, name: "Milk, whole" }],
    ["cinnamon", { id: "cinnamon", source: "USDA", sourceExternalId: "cinnamon", type: "GENERIC", isLocal: true, name: "Cinnamon, ground" }],
    ["banana", { id: "banana", source: "USDA", sourceExternalId: "banana", type: "GENERIC", isLocal: true, name: "Banana, raw" }],
    ["honey", { id: "honey", source: "USDA", sourceExternalId: "honey", type: "GENERIC", isLocal: true, name: "Honey" }],
  ] as const;
  assert.deepEqual(
    concepts.map(([query, candidate]) => selectNutritionFoodCandidate(query, [candidate])?.id),
    ["oats", "milk", "cinnamon", "banana", "honey"]
  );
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

test("Food, Describe, AI Scan, and saved-meal search consume the shared ranked response", async () => {
  const [service, tracker, quickActions, savedMeals] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionQuickActions.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/nutrition/NutritionSavedMeals.tsx", import.meta.url), "utf8")),
  ]);
  assert.match(service, /rankNutritionFoodCandidates/);
  assert.match(service, /const rankedResults = rankNutritionFoodCandidates/);
  assert.ok(service.indexOf("const rankedResults") < service.indexOf("const limited"));
  assert.match(service, /diversifyNutritionFoodCandidates\(rankedResults\)\.slice\(0, NUTRITION_SEARCH_RESULT_LIMIT\)/);
  assert.match(tracker, /data\.results \?\?/);
  assert.match(quickActions, /selectNutritionFoodCandidate/);
  assert.match(quickActions, /searchLocalCanonical/);
  assert.ok(quickActions.indexOf("searchLocalCanonical") < quickActions.indexOf("return selectNutritionFoodCandidate\(query, await searchCanonical"));
  assert.match(quickActions, /resolveCanonicalFood/);
  assert.match(savedMeals, /data\.results \?\?/);
});
