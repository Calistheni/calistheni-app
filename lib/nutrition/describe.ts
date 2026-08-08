import { z } from "zod";

export const describedFoodSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    preparation: z.string().trim().min(1).max(80).optional(),
    estimatedGrams: z.number().finite().positive().max(10_000).optional(),
    quantityText: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const describedMealResultSchema = z
  .object({ foods: z.array(describedFoodSchema).min(1).max(20) })
  .strict();

export type DescribedMealResult = z.infer<typeof describedMealResultSchema>;

export const describedMealJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["foods"],
  properties: {
    foods: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          label: { type: "string" },
          preparation: { type: "string" },
          estimatedGrams: { type: "number" },
          quantityText: { type: "string" },
        },
      },
    },
  },
} as const;
