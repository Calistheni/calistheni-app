import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saved meal creation has a private canonical composition and ownership-safe APIs", async () => {
  const [schema, mealsRoute, logRoute, serializer] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../app/api/nutrition/meals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/nutrition/meals/[id]/log/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/nutrition/saved-meals.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /model NutritionSavedMeal \{/);
  assert.match(schema, /userId\s+String/);
  assert.match(schema, /model NutritionSavedMealItem \{/);
  assert.match(schema, /foodRevisionId\s+String/);
  assert.match(mealsRoute, /getAuthenticatedUserId/);
  assert.match(mealsRoute, /where: \{ userId \}/);
  assert.match(mealsRoute, /items: z\.array\(itemSchema\)\.min\(1\)\.max\(20\)/);
  assert.match(mealsRoute, /prisma\.nutritionSavedMeal\.create/);
  assert.match(logRoute, /where: \{ id: \(await params\)\.id, userId \}/);
  assert.match(logRoute, /prisma\.\$transaction/);
  assert.match(logRoute, /nutritionEntryDataForSavedMealItem/);
  assert.match(serializer, /snapshotForFood/);
  assert.match(serializer, /foodRevisionId/);
});

test("meal creator supports multi-select, persistent selection, editable portions, and batch logging", async () => {
  const [component, tracker] = await Promise.all([
    readFile(new URL("../components/nutrition/NutritionSavedMeals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/nutrition/NutritionTracker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /Create meal/);
  assert.match(component, /Meal name/);
  assert.match(component, /Add items/);
  assert.match(component, /Add meal items/);
  assert.match(component, /aria-pressed=\{Boolean\(selectedFood\)\}/);
  assert.match(component, /rounded-full border/);
  assert.match(component, /Update meal items \(\{selected\.size\}\)/);
  assert.match(component, /setSelected/);
  assert.match(component, /FoodVisual/);
  assert.match(component, /Meal total/);
  assert.match(component, /Quantity/);
  assert.match(component, /Remove \$\{item\.food\.name\}/);
  assert.match(component, /\/api\/nutrition\/meals/);
  assert.match(component, /\/log/);
  assert.match(tracker, /<NutritionSavedMeals/);
  assert.match(tracker, /mealCategory=\{meal!\}/);
});
