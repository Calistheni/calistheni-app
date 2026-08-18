import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Saved Foods keeps the full visibility-checked user collection in newest-first order", async () => {
  const [schema, route, picker] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("app/api/nutrition/saved-foods/route.ts", root), "utf8"),
    readFile(new URL("components/nutrition/FoodPicker.tsx", root), "utf8"),
  ]);

  assert.match(
    schema,
    /model NutritionSavedFood[\s\S]*@@unique\(\[userId, foodId\]\)/
  );
  assert.match(
    route,
    /where: \{ userId, food: nutritionFoodVisibilityWhere\(userId\) \}/
  );
  assert.match(route, /orderBy: \{ createdAt: "desc" \}/);
  assert.doesNotMatch(route, /findMany\([\s\S]*take:/);
  assert.match(picker, /loadSavedFoodsCache<Food>\(\)/);
  assert.doesNotMatch(
    picker,
    /savedFoodsCache.*\.slice\(0, NUTRITION_SEARCH_RESULT_LIMIT\)/
  );
  assert.match(picker, /data-slot="food-picker-results"[\s\S]*overflow-y-auto/);
});

test("Saved Food mutations are idempotent and invalidate stale picker data", async () => {
  const [post, deletion, cache, tracker, picker] = await Promise.all([
    readFile(new URL("app/api/nutrition/saved-foods/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/nutrition/saved-foods/[foodId]/route.ts", root),
      "utf8"
    ),
    readFile(new URL("lib/nutrition/saved-foods-cache.ts", root), "utf8"),
    readFile(
      new URL("components/nutrition/NutritionTracker.tsx", root),
      "utf8"
    ),
    readFile(new URL("components/nutrition/FoodPicker.tsx", root), "utf8"),
  ]);

  assert.match(post, /nutritionSavedFood\.upsert/);
  assert.match(post, /saved: true,[\s\S]*foodId: food\.id/);
  assert.match(deletion, /nutritionSavedFood\.deleteMany/);
  assert.match(deletion, /where: \{ userId, foodId \}/);
  assert.match(deletion, /saved: false, foodId/);
  assert.match(cache, /savedFoodsVersion \+= 1/);
  assert.match(cache, /requestVersion === savedFoodsVersion/);
  assert.match(cache, /: loadSavedFoodsCache<T>\(\)/);
  assert.match(tracker, /invalidateSavedFoodsCache\(\)/);
  assert.match(picker, /updateSavedFoodsCache\(savedFood, !saved\)/);
  assert.match(picker, /onSavedFoodChange\?\.\(food\.id, !saved\)/);
  assert.match(picker, /savingFoodIds\.has\(food\.id\)/);
  assert.match(tracker, /savingSavedFoodIds\.has\(entry\.foodId\)/);
});
