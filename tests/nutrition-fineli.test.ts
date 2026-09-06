import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isFineliDish,
  isFineliFood,
  mapFineliServings,
  normalizeFineliFood,
  parseFineliSearchResponse,
  rankFineliFoods,
  type FineliFood,
} from "../lib/nutrition/providers/fineli";
import {
  FINELI_BASIC_PACKAGE_2_URL,
  parseFineliBasicPackage,
  searchFineliDataset,
} from "../lib/nutrition/providers/fineli-dataset";
import { scoreNutritionFoodCandidate } from "../lib/nutrition/search-ranking";

function fixture(name: string, id: number, type: "FOOD" | "DISH" = "FOOD", preparation = "RAW"): FineliFood & { fiber: number } {
  return {
    id,
    type: { code: type, name: { en: type === "FOOD" ? "Basic food" : "Dish" } },
    name: { en: name },
    preparationMethod: [{ code: preparation, name: { en: preparation === "RAW" ? "No treatment" : preparation } }],
    ingredientClass: [{ code: "APPLE", name: { en: "Fruit" } }],
    functionClass: [],
    ediblePortion: 100,
    units: [],
    energyKcal: 37.049,
    fat: 0.087,
    protein: 0.165,
    carbohydrate: 7.712,
    salt: 2.34,
    saturatedFat: 0.02,
    sugar: 7.1,
    fiber: 0,
  };
}

test("parses the observed Fineli response shape and imports only verified nutrients", () => {
  const food = normalizeFineliFood(fixture("Apple, Average, With Skin", 28916));
  assert.equal(food.provider, "FINELI");
  assert.equal(food.externalId, "28916");
  assert.equal(food.name, "Apple, Average, With Skin");
  assert.equal(food.languageCode, "en");
  assert.equal(food.searchMetadata?.fineliType, "FOOD");
  assert.equal(food.verificationStatus, "OFFICIAL_SOURCE");
  assert.deepEqual(food.nutritionPer100g, {
    caloriesKcal: 37.049,
    proteinGrams: 0.165,
    carbohydrateGrams: 7.712,
    fatGrams: 0.087,
    sugarGrams: 7.1,
    saturatedFatGrams: 0.02,
    saltGrams: 0.002,
  });
  assert.equal("fiberGrams" in food.nutritionPer100g, false);
});

test("maps useful Fineli household servings and excludes energy utility portions", () => {
  const input = fixture("Apple, Average, With Skin", 28916);
  input.units = [
    { code: "KPL_S", description: { en: "small piece" }, mass: 90 },
    { code: "KPL_M", description: { en: "medium-sized piece" }, mass: 130 },
    { code: "KPL_L", description: { en: "big piece" }, mass: 180 },
    { code: "PORT1000KJ", description: { en: "Portion equivalent with 1000 kJ" }, mass: 675 },
  ];
  assert.deepEqual(mapFineliServings(input).map((serving) => [serving.name, serving.grams]), [
    ["100 g", 100],
    ["Small piece", 90],
    ["Medium-sized piece", 130],
    ["Big piece", 180],
  ]);
});

test("Fineli FOOD ranks first for simple foods while DISH remains valid for composite intent", () => {
  const candidates = parseFineliSearchResponse([
    fixture("Apple Pie", 1, "DISH", "BAK"),
    fixture("Fruit Salad, Orange, Banana, Apple, Peach", 2, "DISH", "MIX"),
    fixture("Apple Rice Porridge", 3, "DISH", "BOIL"),
    fixture("Apple, Domestic, With Skin", 4),
    fixture("Apple, Imported, With Skin", 5),
    fixture("Apple, Dried", 6, "FOOD", "DRIE"),
    fixture("Apple Chips", 7, "FOOD", "IND"),
    fixture("Apple, Average, With Skin", 28916),
  ]);
  assert.equal(rankFineliFoods("apple", candidates, true)[0]?.name, "Apple, Average, With Skin");
  assert.equal(rankFineliFoods("apple pie", candidates, true)[0]?.name, "Apple Pie");
  assert.equal(isFineliFood(candidates.find((candidate) => candidate.externalId === "28916")!), true);
  assert.equal(isFineliDish(candidates.find((candidate) => candidate.externalId === "1")!), true);
});

test("common simple foods produce Fineli FOOD previews with stable provider identities", () => {
  for (const [index, name] of ["Apple", "Banana", "Rice, Cooked", "Potato, Cooked", "Salmon, Cooked", "Chicken Breast", "Egg, Whole", "Oats", "Beef", "Pork"].entries()) {
    const food = normalizeFineliFood(fixture(name, 1000 + index));
    assert.equal(food.provider, "FINELI");
    assert.equal(food.externalId, String(1000 + index));
    assert.equal(food.searchMetadata?.fineliType, "FOOD");
  }
});

const datasetFoodCsv = `FOODID;FOODTYPE;IGCLASS;FUCLASS;ENFDNAME;PROCESS;EDPORT
28916;FOOD;APPLE;FRUIT;Apple, Average, With Skin;RAW;100
28917;FOOD;APPLE;FRUIT;Apple, Domestic, With Skin;RAW;100
7001;FOOD;FISH;MAIN;Salmon, Cooked;BOIL;100
7002;DISH;DISH;MAIN;Salmon Salad;MIX;100
8001;FOOD;POTATO;MAIN;Potato, Boiled;BOIL;100`;
const datasetComponentCsv = `EUFDNAME;COMPUNIT
ENERC;KJ
FAT;G
PROT;G
CHOAVL;G
SUGAR;G
FASAT;G
FIBC;G
FATRN;G
NA;MG
NACL;MG`;
const datasetValuesCsv = `FOODID;EUFDNAME;BESTLOC
28916;ENERC;155
28916;FAT;0,087
28916;PROT;0,165
28916;CHOAVL;7,712
28916;SUGAR;7,1
28916;FASAT;0,02
28916;FIBC;2,4
28916;FATRN;0,01
28916;NA;1,2
28916;NACL;2,34
28917;ENERC;160
28917;FAT;0,1
28917;PROT;0,2
28917;CHOAVL;8
7001;ENERC;860
7001;FAT;12
7001;PROT;22
7001;CHOAVL;0
7002;ENERC;700
7002;FAT;10
7002;PROT;12
7002;CHOAVL;4
8001;ENERC;330
8001;FAT;0,1
8001;PROT;2
8001;CHOAVL;17`;

test("parses Basic Package CSV records, preserves FOOD/DISH, and maps verified per-100g fields", () => {
  const records = parseFineliBasicPackage({
    foodCsv: datasetFoodCsv,
    componentValueCsv: datasetValuesCsv,
    componentCsv: datasetComponentCsv,
    foodAddUnitCsv: `FOODID;THSCODE;MASS\n28916;KPL_M;130\n28916;PORT1000KJ;675`,
    foodNameEnCsv: `FOODID;FOODNAME;LANG\n28916;APPLE, AVERAGE, WITH SKIN;EN`,
    foodNameFiCsv: `FOODID;FOODNAME;LANG\n28916;OMENA, KESKIMÄÄRIN, KUORINEEN;FI`,
    foodNameSvCsv: `FOODID;FOODNAME;LANG\n28916;ÄPPLE, GENOMSNITTLIGT, MED SKAL;SV`,
    datasetVersion: "fixture-2026",
  });
  const apple = records.find((record) => record.externalId === "28916")!;
  assert.equal(records.length, 5);
  assert.equal(apple.searchMetadata.fineliType, "FOOD");
  assert.equal(records.find((record) => record.externalId === "7002")?.searchMetadata.fineliType, "DISH");
  assert.ok(Math.abs((apple.nutritionPer100g.caloriesKcal ?? 0) - 155 / 4.184) < 0.001);
  assert.equal(apple.nutritionPer100g.saltGrams, 0.002);
  assert.equal(apple.nutritionPer100g.sugarGrams, 7.1);
  assert.equal(apple.nutritionPer100g.saturatedFatGrams, 0.02);
  assert.equal(apple.nutritionPer100g.fiberGrams, 2.4);
  assert.equal(apple.nutritionPer100g.transFatGrams, 0.01);
  assert.equal(apple.nutritionPer100g.sodiumMg, 1.2);
  assert.deepEqual(apple.servings.map((serving) => serving.name), ["100 g", "Medium-sized piece"]);
  assert.equal(apple.providerVersion, "fixture-2026");
  assert.equal(apple.name, "Apple, Average, With Skin");
  assert.ok(apple.localizedNames?.some((name) => name.name === "OMENA, KESKIMÄÄRIN, KUORINEEN" && name.languageCode === "fi"));
  assert.ok(apple.localizedNames?.some((name) => name.name === "ÄPPLE, GENOMSNITTLIGT, MED SKAL" && name.languageCode === "sv"));
  assert.deepEqual((apple.raw as { name: unknown }).name, {
    en: "APPLE, AVERAGE, WITH SKIN",
    fi: "OMENA, KESKIMÄÄRIN, KUORINEEN",
    sv: "ÄPPLE, GENOMSNITTLIGT, MED SKAL",
  });
});

test("local dataset search excludes DISH and prefers the average generic entry", () => {
  const records = parseFineliBasicPackage({ foodCsv: datasetFoodCsv, componentValueCsv: datasetValuesCsv });
  assert.equal(searchFineliDataset("apple", records)[0]?.name, "Apple, Average, With Skin");
  assert.deepEqual(searchFineliDataset("salmon", records).map((food) => food.name), ["Salmon, Cooked"]);
  assert.equal(searchFineliDataset("potato", records)[0]?.name, "Potato, Boiled");
});

test("local Fineli dataset search matches Finnish and Swedish localized names", () => {
  const records = parseFineliBasicPackage({
    foodCsv: datasetFoodCsv,
    componentValueCsv: datasetValuesCsv,
    foodNameEnCsv: `FOODID;FOODNAME\n28916;APPLE, AVERAGE, WITH SKIN`,
    foodNameFiCsv: `FOODID;FOODNAME\n28916;OMENA, KESKIMÄÄRIN, KUORINEEN`,
    foodNameSvCsv: `FOODID;FOODNAME\n28916;ÄPPLE, GENOMSNITTLIGT, MED SKAL`,
  });
  assert.equal(searchFineliDataset("omena", records)[0]?.externalId, "28916");
  assert.equal(searchFineliDataset("äpple", records)[0]?.externalId, "28916");
});

test("manual generic ranking favors Fineli while USDA remains a valid deeper candidate", () => {
  const fineli = normalizeFineliFood(fixture("Salmon, Cooked", 7001));
  const usda = { name: "Salmon, Atlantic, farmed, cooked", provider: "USDA" as const, type: "GENERIC" };
  assert.ok(scoreNutritionFoodCandidate("salmon", fineli) > scoreNutritionFoodCandidate("salmon", usda));
  assert.ok(scoreNutritionFoodCandidate("salmon atlantic", usda) > 0);
});

test("Fineli is additive, locally synchronized, idempotent, attributed, and absent from runtime provider calls", async () => {
  const [schema, migration, provider, dataset, datasetStore, service, sync, dataSources, docs, barcode] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20260823120000_add_fineli_food_source/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/providers/fineli.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/providers/fineli-dataset.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/provider-dataset-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/service.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/sync-fineli.mts", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/data-sources/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/nutrition-food-foundation.md", import.meta.url), "utf8"),
    readFile(new URL("../app/api/nutrition/foods/barcode/[barcode]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /enum FoodSource \{\s+FINELI\s+USDA\s+OPEN_FOOD_FACTS/);
  assert.match(migration, /ALTER TYPE "FoodSource" ADD VALUE 'FINELI'/);
  assert.equal(FINELI_BASIC_PACKAGE_2_URL, "https://fineli.fi/fineli/content/file/49");
  assert.match(sync, /"food\.csv"/);
  assert.match(sync, /"component_value\.csv"/);
  assert.doesNotMatch(provider + dataset + docs, /FINELI_API_KEY/);
  assert.match(service, /source_sourceExternalId: \{ source, sourceExternalId: result\.externalId \}/);
  assert.match(service, /status: "SKIPPED_DATASET_SYNC"/);
  assert.match(service, /FoodRevisionReason\.PROVIDER_UPDATE/);
  assert.doesNotMatch(service, /searchFineliFoods|getFineliFood/);
  assert.match(datasetStore, /source_sourceExternalId: \{ source: FoodSource\.FINELI, sourceExternalId: result\.externalId \}/);
  assert.match(datasetStore, /existing \? FoodRevisionReason\.PROVIDER_UPDATE : FoodRevisionReason\.INITIAL_IMPORT/);
  assert.match(sync, /expected Basic Package 2 with 74 components/);
  assert.match(sync, /syncFineliDatasetFood/);
  assert.match(sync, /Cloudflare challenge/);
  assert.match(service, /eligibleRemoteFoodProviders/);
  assert.match(dataSources, /Finnish Institute for Health and Welfare \(THL\)[\s\S]*CC BY 4\.0/);
  assert.match(docs, /nutrition:sync-fineli/);
  assert.match(docs, /FINELI_DATASET_URL=https:\/\/fineli\.fi\/fineli\/content\/file\/49/);
  assert.match(barcode, /getOpenFoodFactsProduct/);
  assert.doesNotMatch(barcode, /Fineli|FINELI/);
});
