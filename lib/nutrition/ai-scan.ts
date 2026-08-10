import { z } from "zod";

export const aiDetectedFoodSchema = z.object({
  label: z.string().trim().min(1).max(120),
  preparation: z.string().trim().min(1).max(80).nullable(),
  speciesOrVariant: z.string().trim().min(1).max(80).nullable(),
  // A visual model should not lose an otherwise useful food just because a
  // portion cannot be estimated from one image. The review can use a serving
  // default and keep the amount editable in that case.
  estimatedGrams: z.number().finite().positive().max(10_000).nullable(),
  quantityText: z.string().trim().min(1).max(80).nullable(),
  visualConfidence: z.number().finite().min(0).max(1),
  specificityConfidence: z.number().finite().min(0).max(1),
}).strict();
export const aiMealScanResultSchema = z.object({ foods: z.array(aiDetectedFoodSchema).max(20), notes: z.array(z.string().trim().min(1).max(200)).max(5) }).strict();
export type AiMealScanResult = z.infer<typeof aiMealScanResultSchema>;

export const aiMealScanJsonSchema = {
  type: "object", additionalProperties: false, required: ["foods", "notes"], properties: {
    foods: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["label", "preparation", "speciesOrVariant", "estimatedGrams", "quantityText", "visualConfidence", "specificityConfidence"], properties: { label: { type: "string" }, preparation: { anyOf: [{ type: "string" }, { type: "null" }] }, speciesOrVariant: { anyOf: [{ type: "string" }, { type: "null" }] }, estimatedGrams: { anyOf: [{ type: "number" }, { type: "null" }] }, quantityText: { anyOf: [{ type: "string" }, { type: "null" }] }, visualConfidence: { type: "number" }, specificityConfidence: { type: "number" } } } },
    notes: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
} as const;
