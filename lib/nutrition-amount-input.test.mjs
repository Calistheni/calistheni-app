import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatNutritionAmount,
  parseNutritionAmount,
} from "./nutrition/amount-input.ts";

test("nutrition amount parsing preserves empty edit buffers and accepts decimals", () => {
  assert.equal(parseNutritionAmount(""), null);
  assert.equal(parseNutritionAmount("0"), null);
  assert.equal(parseNutritionAmount("12.5"), 12.5);
  assert.equal(parseNutritionAmount("0.5"), 0.5);
  assert.equal(parseNutritionAmount("12,5"), 12.5);
  assert.equal(formatNutritionAmount(100), "100");
  assert.equal(formatNutritionAmount(12.5), "12.5");
});

test("the food-details preview never passes an invalid edit state to strict snapshots", async () => {
  const source = await readFile(
    "components/nutrition/FoodDetailsDialog.tsx",
    "utf8"
  );
  const amountInput = await readFile(
    "components/nutrition/NutritionAmountInput.tsx",
    "utf8"
  );

  assert.match(source, /previewGrams !== null/);
  assert.match(source, /isValidNutritionAmount\(grams\)/);
  assert.doesNotMatch(amountInput, /onValidChange\(0\)/);
});

test("food-serving flows use the shared text-buffer amount input", async () => {
  const files = [
    "components/nutrition/FoodDetailsDialog.tsx",
    "components/nutrition/NutritionQuickActions.tsx",
    "components/nutrition/NutritionSavedMeals.tsx",
  ];

  const sources = await Promise.all(
    files.map((file) => readFile(file, "utf8"))
  );
  for (const source of sources) assert.match(source, /NutritionAmountInput/);
  assert.doesNotMatch(sources[0], /nextGrams > 0 \? nextGrams : 100/);
});
