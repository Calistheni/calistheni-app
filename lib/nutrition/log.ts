import { z } from "zod";
import { calculateNutritionSnapshot } from "./snapshots";
import type { NutritionValues } from "./types";

export const mealCategorySchema = z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACKS"]);
export const nutritionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "Use a valid date.");
export const nutritionEntrySchema = z.object({ foodId: z.string().cuid(), date: nutritionDateSchema, mealCategory: mealCategorySchema, gramsConsumed: z.number().finite().positive().max(100_000), quantity: z.number().finite().positive().max(10_000).default(1), unit: z.string().trim().min(1).max(40).default("g") });
export const nutritionEntryUpdateSchema = nutritionEntrySchema.omit({ foodId: true }).partial().refine((value) => Object.keys(value).length > 0, "Provide an entry update.");
export const nutritionTargetsSchema = z.object({ caloriesKcal: z.number().finite().positive().max(20_000).nullable(), proteinGrams: z.number().finite().positive().max(2_000).nullable(), carbohydrateGrams: z.number().finite().positive().max(3_000).nullable(), fatGrams: z.number().finite().positive().max(2_000).nullable() });

export function nutritionDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
export function nutritionTotals(entries: Array<Record<string, unknown>>) {
  const keys = [["caloriesKcal", "caloriesKcalSnapshot"], ["proteinGrams", "proteinGramsSnapshot"], ["carbohydrateGrams", "carbohydrateGramsSnapshot"], ["fatGrams", "fatGramsSnapshot"], ["fiberGrams", "fiberGramsSnapshot"], ["sugarGrams", "sugarGramsSnapshot"], ["saturatedFatGrams", "saturatedFatGramsSnapshot"], ["sodiumMg", "sodiumMgSnapshot"]] as const;
  return Object.fromEntries(keys.map(([target, source]) => [target, entries.reduce((sum, entry) => sum + Number(entry[source] ?? 0), 0)])) as NutritionValues;
}
export function snapshotForFood(values: NutritionValues, gramsConsumed: number) { return calculateNutritionSnapshot(values, gramsConsumed); }
