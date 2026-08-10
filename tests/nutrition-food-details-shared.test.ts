import assert from "node:assert/strict";
import test from "node:test";

const source = (path: string) =>
  import("node:fs/promises").then((fs) =>
    fs.readFile(new URL(`../${path}`, import.meta.url), "utf8")
  );

test("the main Nutrition picker opens the shared food-details component before logging", async () => {
  const tracker = await source("components/nutrition/NutritionTracker.tsx");
  assert.match(tracker, /FoodDetailsDialog/);
  assert.match(tracker, /setInspectedFood\(food\)/);
  assert.match(tracker, /onUseFood=\{logFood\}/);
  assert.doesNotMatch(tracker, /async function choose\(food: Food\)/);
});

test("shared details owns serving selection and delegates contextual logging", async () => {
  const detail = await source("components/nutrition/FoodDetailsDialog.tsx");
  assert.match(detail, /export type FoodUseSelection/);
  assert.match(detail, /chooseServing\(serving\.grams, serving\.name\)/);
  assert.match(detail, /onUseFood\?\.*/);
  assert.match(detail, /resolveFoodId/);
  assert.match(detail, /preview\?\.isLocal && preview\.id/);
  assert.match(detail, /Could not load food details/);
  assert.match(detail, /Try again/);
});

test("using food from the main picker reuses the existing Nutrition entry endpoint", async () => {
  const tracker = await source("components/nutrition/NutritionTracker.tsx");
  assert.match(tracker, /\/api\/user\/nutrition/);
  assert.match(tracker, /gramsConsumed: grams/);
  assert.match(tracker, /onAddEntries\(\[await response\.json\(\)\]\)/);
  assert.match(tracker, /Boolean\(meal\) && !inspectedFood/);
});

test("search rows separate inspect from quick add without bubbling the click", async () => {
  const tracker = await source("components/nutrition/NutritionTracker.tsx");
  assert.match(tracker, /Quick add \$\{food\.name\}/);
  assert.match(tracker, /event\.stopPropagation\(\)/);
  assert.match(tracker, /defaultFoodUseAmount\(food\)/);
  assert.match(tracker, /resolveFoodForUse\(food\)/);
  assert.match(tracker, /setQuickAdding/);
});

test("logged food icons open read-only shared details without changing snapshot quantities", async () => {
  const tracker = await source("components/nutrition/NutritionTracker.tsx");
  const detail = await source("components/nutrition/FoodDetailsDialog.tsx");
  assert.match(tracker, /View details for \$\{entry\.foodNameSnapshot\}/);
  assert.match(tracker, /onInspectFood\(entry\)/);
  assert.match(tracker, /id: inspectingEntry\.foodId/);
  assert.match(tracker, /mode="inspect"/);
  assert.match(detail, /mode === "add"/);
});

test("default food use prefers a persisted default serving before the established 100 g fallback", async () => {
  const useFlow = await source("lib/nutrition/food-use-client.ts");
  assert.match(useFlow, /candidate\.isDefault/);
  assert.match(useFlow, /grams: 100/);
  assert.match(useFlow, /\/api\/nutrition\/foods\/import/);
});

test("the database search page continues to consume the same shared detail component", async () => {
  const search = await source("components/nutrition/NutritionFoodSearch.tsx");
  assert.match(search, /FoodDetailsDialog/);
  assert.match(search, /onImported=\{\(\) => void search\(query\)\}/);
});
