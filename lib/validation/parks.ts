import { z, type ZodIssue } from "zod";
import type {
  ParkFormErrors,
  ParkFormValues,
  ParkMutationPayload,
} from "@/types/park";

function sanitizeTextInput(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeNullableTextInput(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const sanitized = sanitizeTextInput(value);
  return sanitized.length > 0 ? sanitized : null;
}

const requiredText = (fieldName: string, maxLength: number) =>
  z
    .string()
    .transform(sanitizeTextInput)
    .refine((value) => value.length > 0, `${fieldName} is required.`)
    .refine(
      (value) => value.length >= 3,
      `${fieldName} must be at least 3 characters.`
    )
    .refine(
      (value) => value.length <= maxLength,
      `${fieldName} must be ${maxLength} characters or fewer.`
    );

const optionalText = (maxLength: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => sanitizeNullableTextInput(value ?? null))
    .refine(
      (value) => value === null || value.length <= maxLength,
      `Must be ${maxLength} characters or fewer.`
    );

const coordinateSchema = (
  fieldName: "Latitude" | "Longitude",
  min: number,
  max: number
) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .superRefine((value, ctx) => {
      if (value === null || value === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `${fieldName} is required.`,
        });
        return;
      }

      if (typeof value === "string" && value.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${fieldName} is required.`,
        });
        return;
      }

      const parsedValue =
        typeof value === "number" ? value : Number(value.trim());

      if (!Number.isFinite(parsedValue)) {
        ctx.addIssue({
          code: "custom",
          message: `${fieldName} must be a valid number.`,
        });
        return;
      }

      if (parsedValue < min || parsedValue > max) {
        ctx.addIssue({
          code: "custom",
          message: `${fieldName} must be between ${min} and ${max}.`,
        });
      }
    })
    .transform((value) =>
      typeof value === "number" ? value : Number((value ?? "").toString().trim())
    );

export const parkMutationSchema = z.object({
  name: requiredText("Name", 140),
  title: optionalText(160),
  address: optionalText(240),
  lat: coordinateSchema("Latitude", -90, 90),
  lon: coordinateSchema("Longitude", -180, 180),
  equipmentIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "At least one equipment item must be selected.")
    .max(50, "Equipment list must contain 50 items or fewer."),
});

export function mapParkIssuesToFormErrors(issues: ZodIssue[]) {
  return issues.reduce<ParkFormErrors>((errors, issue) => {
    const field = issue.path[0];

    if (typeof field === "string" && !(field in errors)) {
      errors[field as keyof ParkFormErrors] = issue.message;
    }

    return errors;
  }, {});
}

export function getParkFormErrors(
  fieldErrors: Record<string, string[] | undefined> | undefined
) {
  const errors: ParkFormErrors = {};

  if (!fieldErrors) {
    return errors;
  }

  for (const field of ["name", "lat", "lon", "equipmentIds"] as const) {
    const message = fieldErrors[field]?.[0];

    if (message) {
      errors[field] = message;
    }
  }

  return errors;
}

export function validateParkMutation(
  values: ParkFormValues | ParkMutationPayload
):
  | { success: true; data: ParkMutationPayload }
  | { success: false; errors: ParkFormErrors } {
  const parsed = parkMutationSchema.safeParse(values);

  if (!parsed.success) {
    return {
      success: false,
      errors: mapParkIssuesToFormErrors(parsed.error.issues),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}
