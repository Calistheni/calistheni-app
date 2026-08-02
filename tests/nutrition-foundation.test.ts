import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateNutritionSnapshot } from "../lib/nutrition/snapshots.ts";
import { checksumExternalFood, normalizeBarcode, normalizeFoodQuery } from "../lib/nutrition/normalization.ts";
import {
  normalizeUsdaDetailedFood,
  normalizeUsdaFdcId,
  normalizeUsdaSearchFood,
  rankUsdaGenericResults,
  usdaFoodDetailPath,
} from "../lib/nutrition/providers/usda.ts";
import {
  normalizeOpenFoodFactsProduct,
  normalizeOpenFoodFactsStatus,
  parseOpenFoodFactsProductResponse,
} from "../lib/nutrition/providers/open-food-facts.ts";
import { availableFoodIcons, normalizeFoodIconKey, resolveFoodIcon } from "../lib/nutrition/food-icons.ts";

test("food icon inventory normalizes actual public filenames once", () => {
  assert.ok(availableFoodIcons().length >= 100);
  assert.equal(normalizeFoodIconKey("Chicken Breast.png"), "chicken-breast");
  assert.equal(normalizeFoodIconKey("Ground_Beef"), "ground-beef");
  assert.equal(normalizeFoodIconKey("apple.png"), "apple");
  assert.equal(normalizeFoodIconKey("Apple 1.png"), "apple");
  assert.equal(normalizeFoodIconKey("apple_1147564 1 1.png"), "apple");
  assert.equal(normalizeFoodIconKey("Ground Beef 1 1.png"), "ground-beef");
  const apple = resolveFoodIcon({ name: "Apple", type: "GENERIC", source: "USDA" });
  assert.equal(apple?.key, "apple");
  assert.equal(apple?.filename, "apple_1147564 1 1.png");
  assert.equal(apple?.url, "/food-icons/apple_1147564%201%201.png");
});

test("food icon resolver uses exact, aliases, controlled matches, and refuses unsafe substrings", () => {
  assert.equal(resolveFoodIcon({ name: "Ground Beef", type: "GENERIC", source: "USDA" })?.filename, "groundmeat 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Unmapped local name", aliases: ["Apple"], type: "GENERIC", source: "USDA" })?.filename, "apple_1147564 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Chicken Fillet", type: "GENERIC", source: "USDA" })?.filename, "chicken 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Raw Atlantic Salmon", type: "GENERIC", source: "USDA" })?.filename, "salmon 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Cooked White Rice", type: "GENERIC", source: "USDA" })?.filename, "rice 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Garbanzo Beans", type: "GENERIC", source: "USDA" })?.filename, "chickpeas 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Ground Turkey", type: "GENERIC", source: "USDA" })?.filename, "turkey_2276706 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Rice cake", type: "GENERIC", source: "USDA" }), undefined);
  assert.equal(resolveFoodIcon({ name: "Beef broth", type: "GENERIC", source: "USDA" }), undefined);
});

test("common generic foods resolve against the detected asset inventory", () => {
  const expected: Record<string, string> = {
    Banana: "banana_13523336 1 1.png", Strawberry: "strawberry_13523359 1 1.png", "Chicken Breast": "chicken 1 1.png", "Chicken Thigh": "chicken 1 1.png", Steak: "steak 1 1.png", Salmon: "salmon 1 1.png", Tuna: "tuna 1 1.png", Egg: "egg 1 1.png", Milk: "milk 1 1.png", "Greek Yogurt": "greek yogurt 1 1.png", Rice: "rice 1 1.png", Bread: "bread 1 1.png", Oats: "oats 1 1.png", Broccoli: "brocoli 1 1.png", Carrot: "carrot 1 1.png", Potato: "potato 1 1.png", "Sweet Potato": "sweetpotato 1 1.png", "Peanut Butter": "peanut butter 1 1.png", "Olive Oil": "olive oil 1 1.png", Pizza: "pizza 1 1.png", Burger: "burger 1 1.png", Fries: "fries 1 1.png", Salad: "salad 1 1.png", "Protein Shake": "protein shake 1 1.png", Coffee: "coffee 1 1.png", Tea: "tea 1 1.png", Beans: "beans 1 1.png", Lentils: "beans 1 1.png", Chickpeas: "chickpeas 1 1.png",
  };
  for (const [name, filename] of Object.entries(expected)) {
    assert.equal(resolveFoodIcon({ name, type: "GENERIC", source: "USDA" })?.filename, filename, name);
  }
});

test("packaged provider images win over generic icon resolution", () => {
  assert.equal(resolveFoodIcon({ name: "Oreo", imageUrl: "https://images.openfoodfacts.org/oreo.jpg", type: "BRANDED", source: "OPEN_FOOD_FACTS" }), undefined);
  assert.equal(resolveFoodIcon({ name: "Whole Egg", iconKey: "salmon", type: "GENERIC", source: "USDA" })?.filename, "salmon 1 1.png");
});

test("USDA food-family matching handles plural variants without false substitutions", () => {
  assert.equal(resolveFoodIcon({ name: "Peach, raw", type: "GENERIC", source: "USDA" })?.filename, "preach 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Peaches, yellow, raw", type: "GENERIC", source: "USDA" })?.filename, "preach 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Peaches, frozen", type: "GENERIC", source: "USDA" })?.filename, "preach 1 1.png");
  // No pie or generic juice asset exists in the current inventory, so fruit is
  // the only safe fallback. A future pie.png/juice.png takes precedence.
  assert.equal(resolveFoodIcon({ name: "Peach pie", type: "GENERIC", source: "USDA" })?.filename, "preach 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Peach juice", type: "GENERIC", source: "USDA" })?.filename, "preach 1 1.png");
  assert.equal(resolveFoodIcon({ name: "Apricot, raw", type: "GENERIC", source: "USDA" }), undefined);
  assert.equal(resolveFoodIcon({ name: "Potatoes, boiled, without skin", type: "GENERIC", source: "USDA" })?.filename, "potato 1 1.png");
});

test("USDA ranking promotes the simplest generic food but respects prepared searches", () => {
  const result = (fdcId: number, description: string, dataType = "SR Legacy") => ({
    result: normalizeUsdaSearchFood({ fdcId, description, dataType, foodNutrients: searchEgg.foodNutrients }),
    dataType,
    fromGenericFallback: description.includes("raw"),
  });
  const peach = [result(1, "Peaches, canned, heavy syrup"), result(2, "Peach, raw"), result(3, "Peaches, frozen")];
  assert.equal(rankUsdaGenericResults("peach", peach)[0]?.result.name, "Peach, raw");
  const juice = [result(4, "Peach, raw"), result(5, "Peach juice")];
  assert.equal(rankUsdaGenericResults("peach juice", juice)[0]?.result.name, "Peach juice");
  const pie = [result(6, "Peach, raw"), result(7, "Peach pie")];
  assert.equal(rankUsdaGenericResults("peach pie", pie)[0]?.result.name, "Peach pie");
});

test("food visuals keep generic icon, product photo, and placeholder treatments separate", () => {
  const visual = readFileSync(new URL("../components/nutrition/FoodVisual.tsx", import.meta.url), "utf8");
  const search = readFileSync(new URL("../components/nutrition/NutritionFoodSearch.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../components/nutrition/FoodDetailsDialog.tsx", import.meta.url), "utf8");
  assert.match(visual, /const genericIconContainerClass = "flex shrink-0 items-center justify-center"/);
  assert.doesNotMatch(visual, /genericIconContainerClass = "[^"]*\b(bg-muted|bg-card|bg-secondary|border|shadow|rounded-[^" ]+|p-[^" ]+)/);
  assert.match(visual, /<img src=\{iconPath\}[\s\S]*className="block size-full object-contain"/);
  assert.match(visual, /const productImageContainerClass = "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"/);
  assert.match(visual, /<Image src=\{imageUrl\}[\s\S]*quality=\{80\}[\s\S]*className="size-full object-cover"/);
  assert.match(visual, /const placeholderContainerClass = "flex shrink-0 items-center justify-center rounded-lg bg-muted"/);
  assert.match(visual, /<Package className="size-5 text-muted-foreground"/);
  assert.match(search, /<FoodVisual imageUrl=\{food\.imageUrl\} iconPath=\{food\.genericIcon\?\.url\}/);
  assert.match(detail, /<FoodVisual imageUrl=\{food\.images\.front\} iconPath=\{food\.genericIcon\?\.url\}/);
  assert.doesNotMatch(`${visual}\n${search}\n${detail}`, /image-rendering:\s*(pixelated|crisp-edges)/);
});

test("normalizes multilingual queries and validates barcode strings without coercion", () => { assert.equal(normalizeFoodQuery("  Сьомга  "), "сьомга"); assert.equal(normalizeBarcode("0012345678905"), "0012345678905"); assert.equal(normalizeBarcode("4823077625626("), null); assert.equal(normalizeBarcode("4823077625626 "), null); assert.equal(normalizeBarcode("not-a-code"), null); });
test("food checksum is stable despite raw provider field order", () => { const food = { provider: "USDA" as const, externalId: "175167", foodType: "GENERIC" as const, name: "Salmon", countryCodes: [], nutritionPer100g: { caloriesKcal: 208, proteinGrams: 20 }, servings: [], confidenceScore: 0.98, verificationStatus: "OFFICIAL_SOURCE" as const, isComplete: true }; assert.equal(checksumExternalFood(food), checksumExternalFood({ ...food, nutritionPer100g: { proteinGrams: 20, caloriesKcal: 208 } })); });
test("historical snapshot scales revision values without mutating its source", () => { const revision = { caloriesKcal: 100, proteinGrams: 5 }; const snapshot = calculateNutritionSnapshot(revision, 150); assert.deepEqual(snapshot, { caloriesKcal: 150, proteinGrams: 7.5 }); assert.deepEqual(revision, { caloriesKcal: 100, proteinGrams: 5 }); });

const searchEgg = {
  fdcId: 171287,
  description: "Egg, whole, raw, fresh",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientId: 1008, nutrientNumber: "208", nutrientName: "Energy", unitName: "KCAL", value: 143 },
    { nutrientId: 1003, nutrientNumber: "203", nutrientName: "Protein", unitName: "G", value: 12.56 },
    { nutrientId: 1004, nutrientNumber: "204", nutrientName: "Total lipid (fat)", unitName: "G", value: 9.51 },
    { nutrientId: 1005, nutrientNumber: "205", nutrientName: "Carbohydrate, by difference", unitName: "G", value: 0.72 },
    { nutrientId: 1079, nutrientNumber: "291", nutrientName: "Fiber, total dietary", unitName: "G", value: 0 },
  ],
};

test("USDA search previews retain the FDC ID and map flattened value nutrients", () => {
  const food = normalizeUsdaSearchFood(searchEgg);
  assert.equal(food.externalId, "171287");
  assert.deepEqual(food.nutritionPer100g, {
    caloriesKcal: 143,
    proteinGrams: 12.56,
    fatGrams: 9.51,
    carbohydrateGrams: 0.72,
    fiberGrams: 0,
  });
  assert.equal(food.isComplete, true);
  assert.equal(food.confidenceScore, 0.98);
});

test("USDA details map nested nutrient.amount independently from search nutrients", () => {
  const food = normalizeUsdaDetailedFood({
    ...searchEgg,
    foodNutrients: searchEgg.foodNutrients.map((nutrient) => ({
      nutrient: {
        id: nutrient.nutrientId,
        number: nutrient.nutrientNumber,
        name: nutrient.nutrientName,
        unitName: nutrient.unitName,
      },
      amount: nutrient.value,
    })),
  });
  assert.equal(food.externalId, "171287");
  assert.equal(food.nutritionPer100g.caloriesKcal, 143);
  assert.equal(food.nutritionPer100g.proteinGrams, 12.56);
  assert.equal(food.nutritionPer100g.fiberGrams, 0);
});

test("USDA maps kJ only when an explicit kcal value is absent", () => {
  const fromKj = normalizeUsdaSearchFood({
    fdcId: 42,
    description: "Energy test",
    foodNutrients: [{ nutrientName: "Energy", nutrientNumber: "268", unitName: "KJ", value: 418.4 }],
  });
  assert.equal(fromKj.nutritionPer100g.caloriesKcal, 100);
  const explicitKcal = normalizeUsdaSearchFood({
    fdcId: 43,
    description: "Energy test",
    foodNutrients: [
      { nutrientName: "Energy", nutrientNumber: "268", unitName: "KJ", value: 418.4 },
      { nutrientId: 1008, nutrientName: "Energy", unitName: "KCAL", value: 90 },
    ],
  });
  assert.equal(explicitKcal.nutritionPer100g.caloriesKcal, 90);
});

test("USDA incomplete records are not presented as high-confidence nutrition", () => {
  const food = normalizeUsdaSearchFood({ fdcId: 44, description: "Identity only", foodNutrients: [] });
  assert.equal(food.isComplete, false);
  assert.equal(food.confidenceScore, 0.2);
});

test("USDA import identifiers accept numeric FDC IDs only", () => {
  assert.equal(normalizeUsdaFdcId("171287"), "171287");
  assert.equal(normalizeUsdaFdcId(171287), "171287");
  for (const invalid of ["", "USDA:171287", "egg", "0", "-1", "[object Object]"]) {
    assert.throws(() => normalizeUsdaFdcId(invalid));
  }
  assert.equal(usdaFoodDetailPath("171287"), "/food/171287");
});

const openFoodFactsWafers = {
  code: "4823077625626",
  product_name: "Hazelnut wafers",
  brands: "Roshen",
  quantity: "216 g",
  serving_size: "18 g",
  serving_quantity: 18,
  image_front_url: "https://images.openfoodfacts.org/images/products/482/307/762/5626/front_en.1.400.jpg",
  image_nutrition_url: "https://images.openfoodfacts.org/images/products/482/307/762/5626/nutrition_en.1.400.jpg",
  image_ingredients_url: "https://images.openfoodfacts.org/images/products/482/307/762/5626/ingredients_en.1.400.jpg",
  categories_tags: ["en:wafer", "en:snacks"],
  countries_tags: ["en:bulgaria"],
  ingredients_text: "Sugar, hazelnuts, wheat flour",
  allergens_tags: ["en:gluten", "en:nuts"],
  traces_tags: ["en:milk"],
  additives_tags: ["en:e322"],
  nutriscore_grade: "e",
  nova_group: 4,
  nutrient_levels: { fat: "high", sugars: "high" },
  ingredients_analysis_tags: ["en:maybe-vegan", "en:maybe-vegetarian", "en:palm-oil"],
  nutriments: {
    "energy-kcal_100g": 555.555555555556,
    energy_100g: 2255.55555555556,
    proteins_100g: 5.55555555555556,
    carbohydrates_100g: 66.6666666666667,
    fat_100g: 27.7777777777778,
    fiber_100g: 0,
    sugars_100g: 38.8888888888889,
    "saturated-fat_100g": 16.6666666666667,
    "trans-fat_100g": 0,
    "added-sugars_100g": 33.333333,
    cholesterol_100g: 0,
    cholesterol_unit: "mg",
    potassium_100g: 0.222,
    potassium_unit: "g",
    calcium_100g: 0,
    calcium_unit: "mg",
    iron_100g: 2.778,
    iron_unit: "mg",
    sodium_100g: 0.138888888888889,
    salt_100g: 0.347222222222222,
  },
};

test("Open Food Facts accepts documented numeric and string product statuses", () => {
  assert.equal(normalizeOpenFoodFactsStatus(1), "FOUND");
  assert.equal(normalizeOpenFoodFactsStatus("1"), "FOUND");
  assert.equal(normalizeOpenFoodFactsStatus("success"), "FOUND");
  assert.equal(normalizeOpenFoodFactsStatus(0), "NOT_FOUND");
  assert.equal(normalizeOpenFoodFactsStatus("not_found"), "NOT_FOUND");
  assert.equal(normalizeOpenFoodFactsStatus("unexpected"), "INVALID_RESPONSE");
});

test("Open Food Facts product envelopes distinguish found, missing, and malformed provider data", () => {
  assert.equal(parseOpenFoodFactsProductResponse({ status: "success", product: openFoodFactsWafers }).status, "FOUND");
  assert.equal(parseOpenFoodFactsProductResponse({ status: 1, product: openFoodFactsWafers }).status, "FOUND");
  assert.equal(parseOpenFoodFactsProductResponse({ status: 0 }).status, "NOT_FOUND");
  assert.throws(() => parseOpenFoodFactsProductResponse({ status: "unexpected", product: openFoodFactsWafers }));
  assert.throws(() => parseOpenFoodFactsProductResponse({ status: { value: 1 } }));
});

test("Open Food Facts normalizes a v3 string-status product as per-100g nutrition", () => {
  const food = normalizeOpenFoodFactsProduct(openFoodFactsWafers);
  assert.equal(food.externalId, "4823077625626");
  assert.equal(food.barcode, "4823077625626");
  assert.equal(food.nutritionPer100g.caloriesKcal, 555.556);
  assert.equal(food.nutritionPer100g.fiberGrams, 0);
  assert.equal(food.nutritionPer100g.sodiumMg, 138.889);
  assert.equal(food.isComplete, true);
  assert.equal(food.nutritionPer100g.transFatGrams, 0);
  assert.equal(food.nutritionPer100g.addedSugarGrams, 33.333);
  assert.equal(food.nutritionPer100g.potassiumMg, 222);
  assert.equal(food.details?.packageQuantityText, "216 g");
  assert.equal(food.details?.allergens.join(","), "gluten,nuts");
  assert.equal(food.details?.nutriScoreGrade, "E");
  assert.equal(food.details?.novaGroup, 4);
});

test("Open Food Facts converts kJ only when kcal is absent and marks sparse data partial", () => {
  const food = normalizeOpenFoodFactsProduct({
    code: "12345678",
    product_name: "Energy test",
    nutriments: { energy_100g: 418.4, proteins_100g: 0 },
  });
  assert.equal(food.nutritionPer100g.caloriesKcal, 100);
  assert.equal(food.nutritionPer100g.proteinGrams, 0);
  assert.equal(food.isComplete, false);
  assert.equal(food.confidenceScore, 0.45);
});
