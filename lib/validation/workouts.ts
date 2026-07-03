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

const nullableDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (!value) {
      return null;
    }

    const sanitized = sanitizeTextInput(value);

    return sanitized.length > 0 ? sanitized : null;
  })
  .refine((value) => {
    if (value === null) {
      return true;
    }

    return !Number.isNaN(new Date(value).getTime());
  }, "Must be a valid date.");

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

export const workoutMutationSchema = z.object({
  title: nullableText(140),
  notes: nullableText(1000),
  startedAt: nullableDate,
  completedAt: nullableDate,
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1, "Exercise is required."),
        notes: nullableText(500),
        sets: z
          .array(
            z.object({
              reps: nullableInteger(0, 10000),
              weight: nullableNumber(0, 100000),
              durationSeconds: nullableInteger(0, 86400),
              distanceMeters: nullableNumber(0, 1000000),
              notes: nullableText(500),
            })
          )
          .min(1, "Add at least one set."),
      })
    )
    .min(1, "Select at least one exercise.")
    .max(50, "A workout can contain up to 50 exercises."),
});

export type ValidWorkoutMutation = z.infer<typeof workoutMutationSchema>;
