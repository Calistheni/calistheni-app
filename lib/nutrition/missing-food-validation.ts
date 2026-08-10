import { z } from "zod";

const proposalNutritionSchema = z.object({
  caloriesKcal: z.number().min(0).max(2_000),
  proteinGrams: z.number().min(0).max(200),
  carbohydrateGrams: z.number().min(0).max(300),
  fatGrams: z.number().min(0).max(200),
  fiberGrams: z.number().min(0).max(150).nullable(),
  sugarGrams: z.number().min(0).max(300).nullable(),
  saturatedFatGrams: z.number().min(0).max(200).nullable(),
  sodiumMg: z.number().min(0).max(100_000).nullable(),
});

export const missingFoodProposalSchema = z.object({
  canonicalName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullable(),
  nutrition: proposalNutritionSchema,
  defaultServingGrams: z.number().min(1).max(2_000).nullable(),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string().trim().min(1).max(160)).max(5),
}).strict();

export type MissingFoodProposal = z.infer<typeof missingFoodProposalSchema>;

/** A warning only: users retain control of confirmed community data. */
export function nutritionSanityWarning(nutrition: MissingFoodProposal["nutrition"]) {
  const derived = nutrition.proteinGrams * 4 + nutrition.carbohydrateGrams * 4 + nutrition.fatGrams * 9;
  return Math.abs(derived - nutrition.caloriesKcal) > Math.max(80, nutrition.caloriesKcal * 0.6);
}
