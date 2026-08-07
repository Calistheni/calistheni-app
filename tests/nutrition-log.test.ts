import assert from "node:assert/strict";
import test from "node:test";
import { nutritionTotals } from "../lib/nutrition/log";

test("daily and meal totals use immutable nutrition snapshots", () => {
  const entries = [
    { caloriesKcalSnapshot: 200, proteinGramsSnapshot: 20, carbohydrateGramsSnapshot: 10, fatGramsSnapshot: 5 },
    { caloriesKcalSnapshot: 300, proteinGramsSnapshot: 10, carbohydrateGramsSnapshot: 50, fatGramsSnapshot: 8 },
  ];
  const total = nutritionTotals(entries);
  assert.deepEqual([total.caloriesKcal, total.proteinGrams, total.carbohydrateGrams, total.fatGrams], [500, 30, 60, 13]);
});
