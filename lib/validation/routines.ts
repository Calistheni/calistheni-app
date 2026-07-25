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

const supersetSchema = z.object({
  key: z.string().min(1).max(100),
  label: nullableText(40),
  colorKey: z.enum(["BLUE", "VIOLET", "AMBER", "GREEN"]),
  restSeconds: nullableInteger(0, 3600),
  plannedRounds: nullableInteger(1, 100),
  exerciseClientIds: z
    .array(z.string().min(1).max(100))
    .min(2, "A superset must contain at least two exercises.")
    .max(50),
});

export const routineMutationSchema = z
  .object({
  name: z
    .string()
    .transform(sanitizeTextInput)
    .refine((value) => value.length > 0, "Name is required.")
    .refine((value) => value.length <= 140, "Name is too long."),
  description: nullableText(1000),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  supersets: z.array(supersetSchema).max(25).default([]),
  exercises: z
    .array(
      z.object({
        clientExerciseId: z.string().min(1).max(100),
        routineExerciseId: z
          .union([z.number().int().positive(), z.null(), z.undefined()])
          .transform((value) => value ?? null),
        exerciseId: z.string().min(1, "Exercise is required."),
        restSeconds: nullableInteger(0, 3600),
        notes: nullableText(500),
        sets: z
          .array(
            z.object({
              reps: nullableInteger(0, 10000),
              weightKg: nullableNumber(0, 100000),
              durationSec: nullableInteger(0, 86400),
              distanceMeters: nullableNumber(0, 100000000),
              steps: nullableInteger(0, 100000000),
              floors: nullableInteger(0, 1000000),
            })
          )
          .min(1, "Add at least one set."),
      })
    )
    .min(1, "Select at least one exercise.")
    .max(50, "A routine can contain up to 50 exercises."),
  })
  .superRefine((payload, ctx) => {
    const keys = new Set(payload.supersets.map((superset) => superset.key));
    const exerciseKeys = new Set(
      payload.exercises.map((exercise) => exercise.clientExerciseId)
    );
    const groupedExerciseKeys = new Set<string>();

    if (keys.size !== payload.supersets.length) {
      ctx.addIssue({
        code: "custom",
        path: ["supersets"],
        message: "Superset identifiers must be unique.",
      });
    }

    if (exerciseKeys.size !== payload.exercises.length) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises"],
        message: "Exercise client identifiers must be unique.",
      });
    }

    for (const [supersetIndex, superset] of payload.supersets.entries()) {
      const uniqueMembers = new Set(superset.exerciseClientIds);

      if (uniqueMembers.size !== superset.exerciseClientIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["supersets", supersetIndex, "exerciseClientIds"],
          message: "A superset cannot contain the same exercise twice.",
        });
      }

      for (const [memberIndex, exerciseClientId] of
        superset.exerciseClientIds.entries()) {
        if (!exerciseKeys.has(exerciseClientId)) {
          ctx.addIssue({
            code: "custom",
            path: [
              "supersets",
              supersetIndex,
              "exerciseClientIds",
              memberIndex,
            ],
            message:
              "This superset references an exercise that is not present in the routine.",
          });
        }

        if (groupedExerciseKeys.has(exerciseClientId)) {
          ctx.addIssue({
            code: "custom",
            path: [
              "supersets",
              supersetIndex,
              "exerciseClientIds",
              memberIndex,
            ],
            message: "An exercise cannot belong to more than one superset.",
          });
        }

        groupedExerciseKeys.add(exerciseClientId);
      }
    }
  });

export type ValidRoutineMutation = z.infer<typeof routineMutationSchema>;

export type RoutineValidationErrorCode =
  | "INVALID_SUPERSET_EXERCISE_REFERENCE"
  | "SUPERSET_TOO_SMALL"
  | "DUPLICATE_SUPERSET_MEMBERSHIP"
  | "DUPLICATE_CLIENT_EXERCISE_ID"
  | "INVALID_SUPERSET_POSITION"
  | "INVALID_SHARED_REST"
  | "INVALID_ROUTINE_PAYLOAD";

export function getRoutineValidationError(
  error: z.ZodError
): {
  code: RoutineValidationErrorCode;
  path: PropertyKey[];
  message: string;
} {
  const issue = error.issues[0];
  const message = issue?.message ?? "Invalid routine payload.";

  let code: RoutineValidationErrorCode = "INVALID_ROUTINE_PAYLOAD";

  if (message.includes("not present in the routine")) {
    code = "INVALID_SUPERSET_EXERCISE_REFERENCE";
  } else if (message.includes("at least two exercises")) {
    code = "SUPERSET_TOO_SMALL";
  } else if (
    message.includes("more than one superset") ||
    message.includes("same exercise twice")
  ) {
    code = "DUPLICATE_SUPERSET_MEMBERSHIP";
  } else if (message.includes("client identifiers must be unique")) {
    code = "DUPLICATE_CLIENT_EXERCISE_ID";
  } else if (issue?.path.includes("restSeconds")) {
    code = "INVALID_SHARED_REST";
  }

  return {
    code,
    path: issue?.path ?? [],
    message,
  };
}
