import { z } from "zod";
import { optionalNoteSchema } from "./notes.ts";
import {
  getMeasurementCapabilities,
  MEASUREMENT_CATALOGUE,
  type DirectMeasurementKey,
  type MeasurementKey,
} from "./anthropometry.ts";

export function startOfWeekMonday(date: Date) {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value;
}
export function previousCompletedWeek(date = new Date()) {
  const currentWeekStart = startOfWeekMonday(date);
  const weekStart = new Date(currentWeekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return { weekStart, weekEnd: currentWeekStart };
}
export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export const SUPPLEMENT_UNITS = [
  "g",
  "mg",
  "mcg",
  "ml",
  "capsule",
  "tablet",
  "scoop",
  "serving",
  "drop",
  "packet",
  "custom",
] as const;

/** Storage keys for the canonical direct measurement set. Body fat remains an
 * integration-only stored value for Apple Health compatibility. */
export const MEASUREMENT_FIELDS = [
  "bodyweightKg",
  "heightCm",
  "neckCm",
  "shouldersCm",
  "chestCm",
  "waistCm",
  "hipsCm",
  "bicepsCm",
  "forearmCm",
  "wristCm",
  "thighCm",
  "calfCm",
  "ankleCm",
  "bodyFatPercentage",
] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];
export const DIRECT_MEASUREMENT_FIELDS = MEASUREMENT_FIELDS.filter(
  (field) => field !== "bodyFatPercentage"
) as readonly Exclude<MeasurementField, "bodyFatPercentage">[];

export const LEGACY_MEASUREMENT_KEY_MAP = {
  bodyweightKg: "bodyweightKg",
  heightCm: "heightCm",
  neckCm: "neckCm",
  shouldersCm: "shouldersCm",
  chestCm: "chestCm",
  waistCm: "waistAtNavelCm",
  hipsCm: "hipsCm",
  bicepsCm: "bicepsCm",
  forearmCm: "forearmCm",
  wristCm: "wristCm",
  thighCm: "thighCm",
  calfCm: "calfCm",
  ankleCm: "ankleCm",
  bodyFatPercentage: "manualBodyFatPercent",
} as const satisfies Record<MeasurementField, MeasurementKey>;

const decimalValue = (field: MeasurementField) => {
  const metadata = MEASUREMENT_CATALOGUE[LEGACY_MEASUREMENT_KEY_MAP[field]];
  return z.coerce.number().finite().min(metadata.min).max(metadata.max);
};
export const measurementSchema = z
  .object({
    measuredAt: z.coerce.date(),
    // The transformer accepts undefined, but Zod still requires an object key
    // unless the field itself is optional. Check-ins deliberately omit note
    // when it is blank.
    note: optionalNoteSchema.optional(),
    clearFields: z
      .array(z.enum(MEASUREMENT_FIELDS))
      .max(MEASUREMENT_FIELDS.length)
      .optional()
      .default([]),
    source: z.enum(["MANUAL", "APPLE_HEALTH"]).optional().default("MANUAL"),
    healthExportKinds: z
      .array(z.enum(["BODY_WEIGHT", "BODY_FAT", "WAIST", "HEIGHT"]))
      .max(4)
      .optional()
      .default([]),
    ...Object.fromEntries(
      MEASUREMENT_FIELDS.map((field) => [field, decimalValue(field).optional()])
    ),
  })
  .strict()
  .refine(
    (value) =>
      MEASUREMENT_FIELDS.some((field) => Object.hasOwn(value, field)) ||
      value.clearFields.length > 0,
    { message: "Add at least one measurement or choose a field to clear." }
  );

export type MeasurementSnapshotValues = Partial<
  Record<MeasurementField, number | null | undefined>
>;
export function mergeMeasurementSnapshot(
  latest: MeasurementSnapshotValues | null | undefined,
  submitted: MeasurementSnapshotValues,
  clearFields: readonly MeasurementField[] = []
) {
  const cleared = new Set(clearFields);
  const merged: MeasurementSnapshotValues = {};
  for (const field of MEASUREMENT_FIELDS) {
    if (cleared.has(field)) merged[field] = null;
    else if (Object.hasOwn(submitted, field)) merged[field] = submitted[field];
    else if (latest && Object.hasOwn(latest, field))
      merged[field] = latest[field];
  }
  return merged;
}

export function validateStoredMeasurementCapabilities(
  entry: Partial<Record<MeasurementField, unknown>>,
  isPro: boolean
) {
  const allowedKeys = new Set(getMeasurementCapabilities(isPro).allowedKeys);
  const errors = Object.fromEntries(
    MEASUREMENT_FIELDS.filter(
      (field) =>
        entry[field] != null &&
        (field === "bodyFatPercentage"
          ? !isPro
          : !allowedKeys.has(
              LEGACY_MEASUREMENT_KEY_MAP[field] as DirectMeasurementKey
            ))
    ).map((field) => [field, "This measurement requires Pro."])
  );
  return Object.keys(errors).length
    ? { success: false as const, errors }
    : { success: true as const };
}

const dosageSchema = z
  .union([z.number(), z.string()])
  .transform((value, context) => {
    if (typeof value === "string") {
      if (!/^\d+(?:\.\d+)?$/.test(value)) {
        context.addIssue({ code: "custom", message: "Enter a valid dosage." });
        return z.NEVER;
      }
      return Number(value);
    }
    return value;
  })
  .pipe(z.number().finite().nonnegative().max(100000));
export const supplementPlanSchema = z
  .object({
    supplementDefinitionId: z.string().cuid().optional().nullable(),
    customName: z.string().trim().min(1).max(100).optional().nullable(),
    dosage: dosageSchema.optional().nullable(),
    unit: z.enum(SUPPLEMENT_UNITS).optional().nullable(),
    frequency: z.enum([
      "DAILY",
      "SELECTED_WEEKDAYS",
      "EVERY_N_DAYS",
      "TIMES_PER_WEEK",
      "AS_NEEDED",
    ]),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    everyNDays: z.number().int().min(1).max(365).optional().nullable(),
    timesPerWeek: z.number().int().min(1).max(7).optional().nullable(),
    preferredTime: z
      .enum([
        "MORNING",
        "PRE_WORKOUT",
        "POST_WORKOUT",
        "AFTERNOON",
        "EVENING",
        "BEDTIME",
        "CUSTOM",
      ])
      .optional()
      .nullable(),
    preferredTimeCustom: z.string().trim().max(50).optional().nullable(),
  })
  .refine((value) => value.supplementDefinitionId || value.customName, {
    message: "Choose a supplement or enter a custom name.",
  })
  .refine(
    (value) =>
      value.frequency !== "SELECTED_WEEKDAYS" || value.weekdays.length > 0,
    { message: "Choose at least one weekday." }
  );
export function isPlanScheduledOn(
  plan: {
    frequency: string;
    weekdays: number[];
    everyNDays: number | null;
    createdAt: Date;
  },
  date: Date
) {
  if (plan.frequency === "AS_NEEDED") return false;
  if (plan.frequency === "DAILY" || plan.frequency === "TIMES_PER_WEEK")
    return true;
  if (plan.frequency === "SELECTED_WEEKDAYS")
    return plan.weekdays.includes(date.getUTCDay() || 7);
  const elapsed = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(
        plan.createdAt.getUTCFullYear(),
        plan.createdAt.getUTCMonth(),
        plan.createdAt.getUTCDate()
      )) /
      86400000
  );
  return elapsed >= 0 && elapsed % (plan.everyNDays ?? 1) === 0;
}
export function formatWeekRange(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}
