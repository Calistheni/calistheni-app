import { z } from "zod";

export const nutritionGoalFields = [
  ["caloriesKcal", "Calories", "kcal"],
  ["proteinGrams", "Protein", "g"],
  ["carbohydrateGrams", "Carbs", "g"],
  ["fatGrams", "Fat", "g"],
] as const;

export type NutritionGoalKey = (typeof nutritionGoalFields)[number][0];

export type NutritionGoalValues = Record<NutritionGoalKey, number>;

export type EffectiveNutritionGoal = NutritionGoalValues & {
  effectiveFrom: string;
};

export type NutritionDailyTotals = NutritionGoalValues;

export type NutritionGoalProgress = {
  overallProgress: number;
  overallDisplayProgress: number;
  complete: boolean;
  targets: Record<
    NutritionGoalKey,
    {
      actual: number;
      target: number;
      progress: number;
      displayProgress: number;
    }
  >;
};

const positiveGoal = z.number().finite().positive().max(100_000);

/** All four targets are required in V1 so completion has one clear meaning. */
export const nutritionGoalSchema = z.object({
  caloriesKcal: positiveGoal,
  proteinGrams: positiveGoal,
  carbohydrateGrams: positiveGoal,
  fatGrams: positiveGoal,
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Backward-compatible export used by the old targets endpoint. */
export const nutritionTargetsSchema = nutritionGoalSchema.omit({
  effectiveFrom: true,
});

export function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function calculateNutritionGoalProgress(
  actual: Partial<NutritionDailyTotals>,
  goal: NutritionGoalValues
): NutritionGoalProgress {
  const targets = Object.fromEntries(
    nutritionGoalFields.map(([key]) => {
      const target = goal[key];
      const consumed = numberOrZero(actual[key]);
      const progress = consumed / target;
      return [
        key,
        {
          actual: consumed,
          target,
          progress,
          displayProgress: Math.min(1, Math.max(0, progress)),
        },
      ];
    })
  ) as NutritionGoalProgress["targets"];

  const targetProgress = Object.values(targets);
  const overallDisplayProgress =
    targetProgress.reduce((sum, target) => sum + target.displayProgress, 0) /
    targetProgress.length;

  return {
    targets,
    overallProgress:
      targetProgress.reduce((sum, target) => sum + target.progress, 0) /
      targetProgress.length,
    overallDisplayProgress,
    complete: targetProgress.every((target) => target.progress >= 1),
  };
}

export function macroCalories(goal: NutritionGoalValues) {
  return goal.proteinGrams * 4 + goal.carbohydrateGrams * 4 + goal.fatGrams * 9;
}

/** Returns the latest non-overlapping goal version active on a local date key. */
export function resolveNutritionGoalForDate<T extends EffectiveNutritionGoal>(
  goals: readonly T[],
  dateKey: string
) {
  let resolved: T | null = null;
  for (const goal of goals) {
    if (goal.effectiveFrom <= dateKey) resolved = goal;
    else break;
  }
  return resolved;
}
