import { z } from "zod";

export const describedFoodSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    preparation: z.string().trim().min(1).max(80).nullable(),
    estimatedGrams: z.number().finite().positive().max(10_000).nullable(),
    quantityText: z.string().trim().min(1).max(80).nullable(),
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
        required: ["label", "preparation", "estimatedGrams", "quantityText"],
        properties: {
          label: { type: "string" },
          preparation: { anyOf: [{ type: "string" }, { type: "null" }] },
          estimatedGrams: { anyOf: [{ type: "number" }, { type: "null" }] },
          quantityText: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;
