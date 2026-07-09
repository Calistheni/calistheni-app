import { z } from "zod";

function sanitizeTextInput(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const nullableText = (maxLength: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) {
        return null;
      }

      const sanitized = sanitizeTextInput(value);

      return sanitized.length > 0 ? sanitized : null;
    })
    .refine(
      (value) => value === null || value.length <= maxLength,
      `Must be ${maxLength} characters or fewer.`
    );

const nullableNumber = (min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      return typeof value === "number" ? value : Number(value);
    })
    .refine(
      (value) => value === null || Number.isFinite(value),
      "Must be a valid number."
    )
    .refine(
      (value) => value === null || (value >= min && value <= max),
      `Must be between ${min} and ${max}.`
    );

const nullableInteger = (min: number, max: number) =>
  nullableNumber(min, max).transform((value, ctx) => {
    if (value !== null && !Number.isInteger(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Must be a whole number.",
      });
      return z.NEVER;
    }

    return value;
  });

export const routineMutationSchema = z.object({
  name: z
    .string()
    .transform(sanitizeTextInput)
    .refine((value) => value.length > 0, "Name is required.")
    .refine((value) => value.length <= 140, "Name is too long."),
  description: nullableText(1000),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1, "Exercise is required."),
        restSeconds: nullableInteger(0, 3600),
        notes: nullableText(500),
        sets: z
          .array(
            z.object({
              reps: nullableInteger(0, 10000),
              weightKg: nullableNumber(0, 100000),
              durationSec: nullableInteger(0, 86400),
            })
          )
          .min(1, "Add at least one set."),
      })
    )
    .min(1, "Select at least one exercise.")
    .max(50, "A routine can contain up to 50 exercises."),
});

export type ValidRoutineMutation = z.infer<typeof routineMutationSchema>;
