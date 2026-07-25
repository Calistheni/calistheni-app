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

const allowedRpeValues = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const nullableRpe = nullableNumber(6, 10).refine(
  (value) => value === null || allowedRpeValues.includes(value),
  "RPE must be 6, 7, 7.5, 8, 8.5, 9, 9.5, or 10."
);

const supersetSchema = z.object({
  key: z.string().min(1).max(100),
  label: nullableText(40),
  colorKey: z.enum(["BLUE", "VIOLET", "AMBER", "GREEN"]),
  restSeconds: nullableInteger(0, 3600),
  plannedRounds: nullableInteger(1, 100),
  hardRoundLimit: nullableInteger(1, 100),
});

export const workoutMutationSchema = z
  .object({
  title: nullableText(140),
  notes: nullableText(1000),
  startedAt: nullableDate,
  completedAt: nullableDate,
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PUBLIC"),
  supersets: z.array(supersetSchema).max(25).default([]),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1, "Exercise is required."),
        notes: nullableText(500),
        restSeconds: nullableInteger(0, 3600),
        supersetKey: z
          .union([z.string().min(1).max(100), z.null(), z.undefined()])
          .transform((value) => value ?? null),
        supersetPosition: z
          .union([z.number().int().min(0).max(49), z.null(), z.undefined()])
          .transform((value) => value ?? null),
        sets: z
          .array(
            z.object({
              reps: nullableInteger(0, 10000),
              weight: nullableNumber(0, 100000),
              durationSeconds: nullableInteger(0, 86400),
              distanceMeters: nullableNumber(0, 1000000),
              steps: nullableInteger(0, 1000000),
              floors: nullableInteger(0, 1000000),
              rpe: nullableRpe,
              notes: nullableText(500),
              completed: z.boolean().default(false),
              supersetRoundIndex: nullableInteger(0, 9999),
            })
          )
          .min(1, "Add at least one set."),
      })
    )
    .min(1, "Select at least one exercise.")
    .max(50, "A workout can contain up to 50 exercises."),
  })
  .superRefine((payload, ctx) => {
    const keys = new Set(payload.supersets.map((superset) => superset.key));

    if (keys.size !== payload.supersets.length) {
      ctx.addIssue({
        code: "custom",
        path: ["supersets"],
        message: "Superset identifiers must be unique.",
      });
    }

    for (const exercise of payload.exercises) {
      if (exercise.supersetKey && !keys.has(exercise.supersetKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["exercises"],
          message: "A grouped exercise references an unknown superset.",
        });
      }

      if (
        (exercise.supersetKey === null) !==
        (exercise.supersetPosition === null)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["exercises"],
          message: "Superset position and group must be provided together.",
        });
      }
    }

    for (const superset of payload.supersets) {
      const members = payload.exercises.filter(
        (exercise) => exercise.supersetKey === superset.key
      );
      const positions = new Set(
        members.map((exercise) => exercise.supersetPosition)
      );

      if (members.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["supersets"],
          message: "A superset must contain at least two exercises.",
        });
      }

      if (positions.size !== members.length) {
        ctx.addIssue({
          code: "custom",
          path: ["exercises"],
          message: "Exercise positions inside a superset must be unique.",
        });
      }
    }
  });

export type ValidWorkoutMutation = z.infer<typeof workoutMutationSchema>;
