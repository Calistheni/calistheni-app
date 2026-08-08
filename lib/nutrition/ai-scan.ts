import { z } from "zod";

export const aiDetectedFoodSchema = z.object({
  label: z.string().trim().min(1).max(120),
  estimatedGrams: z.number().finite().positive().max(10_000),
  confidence: z.number().finite().min(0).max(1),
}).strict();
export const aiMealScanResultSchema = z.object({ foods: z.array(aiDetectedFoodSchema).max(20), notes: z.array(z.string().trim().min(1).max(200)).max(5) }).strict();
export type AiMealScanResult = z.infer<typeof aiMealScanResultSchema>;

export const aiMealScanJsonSchema = {
  type: "object", additionalProperties: false, required: ["foods", "notes"], properties: {
    foods: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["label", "estimatedGrams", "confidence"], properties: { label: { type: "string" }, estimatedGrams: { type: "number" }, confidence: { type: "number" } } } },
    notes: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
} as const;
