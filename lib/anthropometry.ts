import { z } from "zod";

export type MeasurementCategory = "Basic" | "Torso" | "Arms" | "Legs";
export type MeasurementCapability = "FREE" | "PRO";
export type BodyFatSex = "MALE" | "FEMALE";

type MeasurementMetadata = {
  label: string;
  helper: string;
  category: MeasurementCategory;
  unit: "kg" | "cm" | "%";
  min: number;
  max: number;
  availability: MeasurementCapability;
  chartEligible: boolean;
  comparisonEligible: boolean;
};

function measurement(
  label: string,
  helper: string,
  category: MeasurementCategory,
  unit: MeasurementMetadata["unit"],
  min: number,
  max: number,
  availability: MeasurementCapability
): MeasurementMetadata {
  return {
    label,
    helper,
    category,
    unit,
    min,
    max,
    availability,
    chartEligible: true,
    comparisonEligible: true,
  };
}

/** One canonical direct-entry catalogue. `manualBodyFatPercent` is retained for
 * imported/direct Health data but deliberately is not shown as a check-in field. */
export const MEASUREMENT_CATALOGUE = {
  bodyweightKg: measurement(
    "Body weight",
    "Current body weight.",
    "Basic",
    "kg",
    20,
    350,
    "FREE"
  ),
  heightCm: measurement(
    "Height",
    "Standing height without shoes.",
    "Basic",
    "cm",
    100,
    250,
    "PRO"
  ),
  neckCm: measurement(
    "Neck",
    "Around the neck just below the Adam’s apple. Keep the tape level without compressing skin.",
    "Torso",
    "cm",
    15,
    80,
    "FREE"
  ),
  shouldersCm: measurement(
    "Shoulders",
    "Circumference around the widest part of both deltoids; tape roughly horizontal, arms relaxed. This is circumference, not width.",
    "Torso",
    "cm",
    40,
    220,
    "PRO"
  ),
  chestCm: measurement(
    "Chest",
    "Around the fullest part of the chest, tape horizontal, measured relaxed.",
    "Torso",
    "cm",
    40,
    220,
    "FREE"
  ),
  waistAtNavelCm: measurement(
    "Waist",
    "Around the waist at navel level. Keep the abdomen relaxed; this is used for the US Navy estimate.",
    "Torso",
    "cm",
    30,
    220,
    "FREE"
  ),
  hipsCm: measurement(
    "Hips",
    "Around the widest part of the hips/glutes with the tape horizontal.",
    "Torso",
    "cm",
    40,
    220,
    "PRO"
  ),
  bicepsCm: measurement(
    "Biceps",
    "Around the largest part of one flexed upper arm. One canonical measurement is used.",
    "Arms",
    "cm",
    10,
    100,
    "FREE"
  ),
  forearmCm: measurement(
    "Forearm",
    "Around the widest part of one forearm.",
    "Arms",
    "cm",
    10,
    80,
    "PRO"
  ),
  wristCm: measurement(
    "Wrist",
    "Around the wrist at its narrowest point.",
    "Arms",
    "cm",
    8,
    40,
    "PRO"
  ),
  thighCm: measurement(
    "Thigh",
    "Around the widest part of one upper thigh. One canonical measurement is used.",
    "Legs",
    "cm",
    20,
    140,
    "PRO"
  ),
  calfCm: measurement(
    "Calf",
    "Around the widest part of one calf. One canonical measurement is used.",
    "Legs",
    "cm",
    10,
    90,
    "PRO"
  ),
  ankleCm: measurement(
    "Ankle",
    "Around the narrowest part of the ankle above the ankle bones.",
    "Legs",
    "cm",
    8,
    50,
    "PRO"
  ),
  manualBodyFatPercent: measurement(
    "Body fat",
    "Direct body-fat value imported from Apple Health or explicitly recorded by a supported integration.",
    "Basic",
    "%",
    2,
    75,
    "PRO"
  ),
} as const satisfies Record<string, MeasurementMetadata>;

export const DIRECT_MEASUREMENT_KEYS = [
  "bodyweightKg",
  "heightCm",
  "neckCm",
  "shouldersCm",
  "chestCm",
  "waistAtNavelCm",
  "hipsCm",
  "bicepsCm",
  "forearmCm",
  "wristCm",
  "thighCm",
  "calfCm",
  "ankleCm",
] as const;
export type MeasurementKey = keyof typeof MEASUREMENT_CATALOGUE;
export type DirectMeasurementKey = (typeof DIRECT_MEASUREMENT_KEYS)[number];
export type MeasurementValues = Partial<Record<MeasurementKey, number | null>>;
export const FREE_MEASUREMENT_HISTORY_LIMIT = 10;
export const MEASUREMENT_KEYS = Object.keys(
  MEASUREMENT_CATALOGUE
) as MeasurementKey[];

export function centimetersToInches(centimeters: number): number | null {
  return Number.isFinite(centimeters) && centimeters > 0
    ? centimeters / 2.54
    : null;
}
export function isValidMeasurementValue(
  key: MeasurementKey,
  value: unknown
): value is number {
  const metadata = MEASUREMENT_CATALOGUE[key];
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= metadata.min &&
    value <= metadata.max
  );
}

export function validateMeasurementValues(
  values: unknown
):
  | { success: true; data: MeasurementValues }
  | { success: false; errors: Record<string, string> } {
  if (!values || typeof values !== "object" || Array.isArray(values))
    return {
      success: false,
      errors: { measurements: "Measurements must be an object." },
    };
  const result: MeasurementValues = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!MEASUREMENT_KEYS.includes(key as MeasurementKey))
      errors[key] = "Unsupported measurement.";
    else if (value === null) result[key as MeasurementKey] = null;
    else if (!isValidMeasurementValue(key as MeasurementKey, value)) {
      const metadata = MEASUREMENT_CATALOGUE[key as MeasurementKey];
      errors[
        key
      ] = `Enter a finite value between ${metadata.min} and ${metadata.max} ${metadata.unit}.`;
    } else result[key as MeasurementKey] = value;
  }
  if (!Object.keys(result).length && !Object.keys(errors).length)
    errors.measurements = "Add at least one measurement.";
  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data: result };
}

export const canonicalMeasurementValuesSchema = z
  .object(
    Object.fromEntries(
      MEASUREMENT_KEYS.map((key) => [
        key,
        z
          .number()
          .finite()
          .min(MEASUREMENT_CATALOGUE[key].min)
          .max(MEASUREMENT_CATALOGUE[key].max)
          .nullable()
          .optional(),
      ])
    ) as unknown as Record<MeasurementKey, z.ZodType>
  )
  .strict();

export function getMeasurementCapabilities(isPro: boolean) {
  const allowedKeys = DIRECT_MEASUREMENT_KEYS.filter(
    (key) => isPro || MEASUREMENT_CATALOGUE[key].availability === "FREE"
  );
  return {
    allowedKeys,
    historyLimit: isPro ? null : FREE_MEASUREMENT_HISTORY_LIMIT,
    canEstimateBodyFat: isPro,
    canViewCalculatedMetrics: isPro,
    canViewMeasurementCharts: isPro,
    canViewAdvancedComparisons: isPro,
  };
}

export function validateMeasurementCapabilities(
  values: unknown,
  isPro: boolean
) {
  const validated = validateMeasurementValues(values);
  if (!validated.success) return validated;
  const allowed = new Set(getMeasurementCapabilities(isPro).allowedKeys);
  const errors = Object.keys(validated.data)
    .filter(
      (key) =>
        key !== "manualBodyFatPercent" &&
        !allowed.has(key as DirectMeasurementKey)
    )
    .reduce<Record<string, string>>(
      (result, key) => ({ ...result, [key]: "This measurement requires Pro." }),
      {}
    );
  return Object.keys(errors).length
    ? { success: false as const, errors }
    : validated;
}

function validInputs(
  inputs: Array<[MeasurementKey, number | null | undefined]>
) {
  return inputs.every(
    ([key, value]) => value != null && isValidMeasurementValue(key, value)
  );
}

/** US Navy circumference estimate. Inputs are canonical centimetres and are converted once to inches. */
export function estimateBodyFatPercentage(
  values: Pick<
    MeasurementValues,
    "heightCm" | "neckCm" | "waistAtNavelCm" | "hipsCm"
  > & { sex: BodyFatSex | null | undefined }
) {
  const { sex, heightCm, neckCm, waistAtNavelCm, hipsCm } = values;
  if (
    !sex ||
    !validInputs([
      ["heightCm", heightCm],
      ["neckCm", neckCm],
      ["waistAtNavelCm", waistAtNavelCm],
    ])
  )
    return null;
  if (sex === "FEMALE" && !validInputs([["hipsCm", hipsCm]])) return null;
  const heightIn = centimetersToInches(heightCm!);
  const neckIn = centimetersToInches(neckCm!);
  const waistIn = centimetersToInches(waistAtNavelCm!);
  const hipsIn = hipsCm == null ? null : centimetersToInches(hipsCm);
  if (
    heightIn == null ||
    neckIn == null ||
    waistIn == null ||
    (sex === "FEMALE" && hipsIn == null)
  )
    return null;
  const argumentValue =
    sex === "MALE" ? waistIn - neckIn : waistIn + hipsIn! - neckIn;
  if (!(argumentValue > 0)) return null;
  const result =
    sex === "MALE"
      ? 86.01 * Math.log10(argumentValue) -
        70.041 * Math.log10(heightIn) +
        36.76
      : 163.205 * Math.log10(argumentValue) -
        97.684 * Math.log10(heightIn) -
        78.387;
  return Number.isFinite(result) ? result : null;
}

export function bodyFatDisplayValue(
  manualBodyFatPercent: number | null | undefined,
  estimatedBodyFatPercent: number | null | undefined
) {
  if (
    manualBodyFatPercent != null &&
    isValidMeasurementValue("manualBodyFatPercent", manualBodyFatPercent)
  )
    return { value: manualBodyFatPercent, source: "manual" as const };
  if (
    estimatedBodyFatPercent != null &&
    Number.isFinite(estimatedBodyFatPercent)
  )
    return { value: estimatedBodyFatPercent, source: "estimated" as const };
  return { value: null, source: "unavailable" as const };
}
export function calculateFatMassKg(
  bodyweightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined
) {
  if (
    !validInputs([
      ["bodyweightKg", bodyweightKg],
      ["manualBodyFatPercent", bodyFatPercent],
    ])
  )
    return null;
  const result = (bodyweightKg! * bodyFatPercent!) / 100;
  return Number.isFinite(result) ? result : null;
}
export function calculateLeanBodyMassKg(
  bodyweightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined
) {
  const fatMassKg = calculateFatMassKg(bodyweightKg, bodyFatPercent);
  const result =
    fatMassKg == null || bodyweightKg == null ? null : bodyweightKg - fatMassKg;
  return result != null && Number.isFinite(result) ? result : null;
}
export function calculateFfmi(
  bodyweightKg: number | null | undefined,
  heightCm: number | null | undefined,
  bodyFatPercent: number | null | undefined
) {
  if (!validInputs([["heightCm", heightCm]])) return null;
  const leanBodyMassKg = calculateLeanBodyMassKg(bodyweightKg, bodyFatPercent);
  const result =
    leanBodyMassKg == null ? null : leanBodyMassKg / (heightCm! / 100) ** 2;
  return result != null && Number.isFinite(result) ? result : null;
}
export function calculateWaistToHeightRatio(
  waistAtNavelCm: number | null | undefined,
  heightCm: number | null | undefined
) {
  if (
    !validInputs([
      ["waistAtNavelCm", waistAtNavelCm],
      ["heightCm", heightCm],
    ])
  )
    return null;
  const result = waistAtNavelCm! / heightCm!;
  return Number.isFinite(result) ? result : null;
}
export function calculateWaistToHipRatio(
  waistAtNavelCm: number | null | undefined,
  hipsCm: number | null | undefined
) {
  if (
    !validInputs([
      ["waistAtNavelCm", waistAtNavelCm],
      ["hipsCm", hipsCm],
    ])
  )
    return null;
  const result = waistAtNavelCm! / hipsCm!;
  return Number.isFinite(result) ? result : null;
}
export function calculateAnthropometrySummary(
  values: Pick<
    MeasurementValues,
    | "bodyweightKg"
    | "heightCm"
    | "manualBodyFatPercent"
    | "waistAtNavelCm"
    | "hipsCm"
  >
) {
  const bodyFatPercent = values.manualBodyFatPercent;
  return {
    fatMassKg: calculateFatMassKg(values.bodyweightKg, bodyFatPercent),
    leanBodyMassKg: calculateLeanBodyMassKg(
      values.bodyweightKg,
      bodyFatPercent
    ),
    ffmi: calculateFfmi(values.bodyweightKg, values.heightCm, bodyFatPercent),
    waistToHeightRatio: calculateWaistToHeightRatio(
      values.waistAtNavelCm,
      values.heightCm
    ),
    waistToHipRatio: calculateWaistToHipRatio(
      values.waistAtNavelCm,
      values.hipsCm
    ),
  };
}
