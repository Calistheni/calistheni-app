import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("nutrition search accepts authenticated POST bodies and does not log the query text", async () => {
  const route = await readFile(new URL("../app/api/nutrition/foods/search/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /getAuthenticatedUserId\(\)/);
  assert.match(route, /await request\.json\(\)/);
  assert.match(route, /console\.error\("NUTRITION_SEARCH_FAILED", \{ queryLength: normalized\.length \}\)/);
  assert.doesNotMatch(route, /console\.error\([^\n]*query[,}]|console\.error\([^\n]*error\)/);

  const callers = await Promise.all([
    "NutritionFoodSearch.tsx",
    "NutritionTracker.tsx",
    "FoodPicker.tsx",
    "NutritionQuickActions.tsx",
    "NutritionSavedMeals.tsx",
  ].map((file) => readFile(new URL(`../components/nutrition/${file}`, import.meta.url), "utf8")));
  for (const source of callers) {
    assert.match(source, /\/api\/nutrition\/foods\/search/);
    assert.doesNotMatch(source, /\/api\/nutrition\/foods\/search\?q=/);
  }
});

test("nutrition barcode lookup accepts POST bodies and does not place barcodes in request paths or logs", async () => {
  const route = await readFile(new URL("../app/api/nutrition/foods/barcode/lookup/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /await request\.json\(\)/);
  assert.match(route, /normalizeBarcode\(submittedBarcode\)/);
  assert.doesNotMatch(route, /console\.(?:error|warn|info|log)[\s\S]{0,100}barcode:\s*(?:value|code|submittedBarcode)/i);

  const callers = await Promise.all([
    "NutritionFoodSearch.tsx",
    "NutritionQuickActions.tsx",
  ].map((file) => readFile(new URL(`../components/nutrition/${file}`, import.meta.url), "utf8")));
  for (const source of callers) {
    assert.match(source, /\/api\/nutrition\/foods\/barcode\/lookup/);
    assert.match(source, /method: "POST"[\s\S]{0,180}body: JSON\.stringify\(\{ barcode \}\)/);
    assert.doesNotMatch(source, /\/api\/nutrition\/foods\/barcode\/\$\{/);
    assert.doesNotMatch(source, /console\.(?:error|warn|info|log)[^\n]*\{\s*barcode\s*:/i);
  }
  const contributionRoute = await readFile(new URL("../app/api/nutrition/foods/barcode/extract-label/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(contributionRoute, /console\.(?:error|warn|info|log)[^\n]*\{[^\n]*barcode\s*:/i);
});
