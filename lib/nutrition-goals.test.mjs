import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNutritionGoalProgress,
  macroCalories,
  resolveNutritionGoalForDate,
} from "./nutrition/goals.ts";

const goal = {
  caloriesKcal: 2800,
  proteinGrams: 100,
  carbohydrateGrams: 200,
  fatGrams: 50,
};

test("nutrition goal progress reports a zero day without completion", () => {
  const progress = calculateNutritionGoalProgress({}, goal);
  assert.equal(progress.overallDisplayProgress, 0);
  assert.equal(progress.complete, false);
});

test("nutrition goal progress averages capped individual targets", () => {
  const progress = calculateNutritionGoalProgress(
    {
      caloriesKcal: 2240,
      proteinGrams: 100,
      carbohydrateGrams: 100,
      fatGrams: 50,
    },
    goal
  );
  assert.equal(progress.overallDisplayProgress, 0.825);
  assert.equal(progress.complete, false);
  assert.equal(progress.targets.proteinGrams.progress, 1);
});

test("nutrition goal completion requires all targets and allows over-target actuals", () => {
  const almost = calculateNutritionGoalProgress(
    {
      caloriesKcal: 2800,
      proteinGrams: 100,
      carbohydrateGrams: 200,
      fatGrams: 49,
    },
    goal
  );
  assert.equal(almost.complete, false);
  assert.equal(almost.overallDisplayProgress, 0.995);

  const complete = calculateNutritionGoalProgress(
    {
      caloriesKcal: 3000,
      proteinGrams: 120,
      carbohydrateGrams: 220,
      fatGrams: 60,
    },
    goal
  );
  assert.equal(complete.complete, true);
  assert.equal(complete.overallDisplayProgress, 1);
  assert.equal(complete.targets.proteinGrams.progress, 1.2);
});

test("macro calorie comparison is informational and does not rewrite a goal", () => {
  assert.equal(macroCalories(goal), 1650);
  assert.equal(goal.caloriesKcal, 2800);
});

test("effective nutrition goals retain historical targets across multiple changes", () => {
  const versions = [
    { ...goal, effectiveFrom: "2026-08-01" },
    {
      caloriesKcal: 2600,
      proteinGrams: 120,
      carbohydrateGrams: 190,
      fatGrams: 55,
      effectiveFrom: "2026-08-07",
    },
    {
      caloriesKcal: 2300,
      proteinGrams: 140,
      carbohydrateGrams: 180,
      fatGrams: 60,
      effectiveFrom: "2026-08-20",
    },
  ];
  assert.equal(resolveNutritionGoalForDate(versions, "2026-07-31"), null);
  assert.equal(
    resolveNutritionGoalForDate(versions, "2026-08-03")?.caloriesKcal,
    2800
  );
  assert.equal(
    resolveNutritionGoalForDate(versions, "2026-08-10")?.caloriesKcal,
    2600
  );
  assert.equal(
    resolveNutritionGoalForDate(versions, "2026-08-25")?.caloriesKcal,
    2300
  );
});

test("nutrition calendar uses one daily aggregate and effective-dated goals", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(
    new URL("./nutrition/goal-service.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /nutritionEntrySnapshot\.groupBy/);
  assert.match(source, /nutritionGoal\.findMany/);
  assert.match(source, /effectiveFrom: \{ lte:/);
  assert.match(source, /calculateNutritionGoalProgress/);
  assert.match(source, /resolveNutritionGoalForDate/);
  assert.match(source, /immutable snapshots are authoritative/);
});
