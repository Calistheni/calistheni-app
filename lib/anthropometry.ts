import { z } from "zod";

export type MeasurementCategory = "Basic" | "Torso" | "Arms" | "Legs";
export type MeasurementCapability = "FREE" | "PRO";

type MeasurementMetadata = {
  label: string;
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
  category: MeasurementCategory,
  unit: MeasurementMetadata["unit"],
  min: number,
  max: number,
  availability: MeasurementCapability
): MeasurementMetadata {
  return {
    label,
    category,
    unit,
    min,
    max,
    availability,
    chartEligible: true,
    comparisonEligible: true,
  };
}

/** The canonical, display- and API-independent measurement catalogue. */
export const MEASUREMENT_CATALOGUE = {
  bodyweightKg: measurement("Bodyweight", "Basic", "kg", 20, 350, "FREE"),
  heightCm: measurement("Height", "Basic", "cm", 100, 250, "PRO"),
  manualBodyFatPercent: measurement("Body fat", "Basic", "%", 2, 75, "PRO"),
  neckCm: measurement("Neck", "Torso", "cm", 15, 80, "FREE"),
  shouldersCm: measurement("Shoulders", "Torso", "cm", 40, 220, "PRO"),
  upperChestCm: measurement("Upper chest", "Torso", "cm", 40, 220, "PRO"),
  chestCm: measurement("Chest", "Torso", "cm", 40, 220, "FREE"),
  waistAtNavelCm: measurement("Waist at navel", "Torso", "cm", 30, 220, "FREE"),
  waistNarrowestCm: measurement("Waist (narrowest)", "Torso", "cm", 30, 220, "PRO"),
  abdomenCm: measurement("Abdomen", "Torso", "cm", 30, 220, "PRO"),
  hipsCm: measurement("Hips", "Torso", "cm", 40, 220, "PRO"),
  glutesCm: measurement("Glutes", "Torso", "cm", 40, 220, "PRO"),
  pelvisCm: measurement("Pelvis", "Torso", "cm", 40, 220, "PRO"),
  leftUpperArmRelaxedCm: measurement("Left upper arm (relaxed)", "Arms", "cm", 10, 100, "PRO"),
  rightUpperArmRelaxedCm: measurement("Right upper arm (relaxed)", "Arms", "cm", 10, 100, "PRO"),
  leftUpperArmFlexedCm: measurement("Left upper arm (flexed)", "Arms", "cm", 10, 100, "FREE"),
  rightUpperArmFlexedCm: measurement("Right upper arm (flexed)", "Arms", "cm", 10, 100, "FREE"),
  leftForearmCm: measurement("Left forearm", "Arms", "cm", 10, 80, "PRO"),
  rightForearmCm: measurement("Right forearm", "Arms", "cm", 10, 80, "PRO"),
  leftWristCm: measurement("Left wrist", "Arms", "cm", 8, 40, "PRO"),
  rightWristCm: measurement("Right wrist", "Arms", "cm", 8, 40, "PRO"),
  leftThighCm: measurement("Left thigh", "Legs", "cm", 20, 140, "PRO"),
  rightThighCm: measurement("Right thigh", "Legs", "cm", 20, 140, "PRO"),
  leftCalfCm: measurement("Left calf", "Legs", "cm", 10, 90, "PRO"),
  rightCalfCm: measurement("Right calf", "Legs", "cm", 10, 90, "PRO"),
  leftAnkleCm: measurement("Left ankle", "Legs", "cm", 8, 50, "PRO"),
  rightAnkleCm: measurement("Right ankle", "Legs", "cm", 8, 50, "PRO"),
} as const satisfies Record<string, MeasurementMetadata>;

export type MeasurementKey = keyof typeof MEASUREMENT_CATALOGUE;
export type MeasurementValues = Partial<Record<MeasurementKey, number | null>>;
export type BodyFatSex = "MALE" | "FEMALE";

export const FREE_MEASUREMENT_HISTORY_LIMIT = 10;
export const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_CATALOGUE) as MeasurementKey[];

export function centimetersToInches(centimeters: number): number | null {
  return Number.isFinite(centimeters) && centimeters > 0 ? centimeters / 2.54 : null;
}

export function isValidMeasurementValue(key: MeasurementKey, value: unknown): value is number {
  const metadata = MEASUREMENT_CATALOGUE[key];
  return typeof value === "number" && Number.isFinite(value) && value >= metadata.min && value <= metadata.max;
}

export function validateMeasurementValues(values: unknown):
  | { success: true; data: MeasurementValues }
  | { success: false; errors: Record<string, string> } {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { success: false, errors: { measurements: "Measurements must be an object." } };
  }

  const result: MeasurementValues = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!MEASUREMENT_KEYS.includes(key as MeasurementKey)) {
      errors[key] = "Unsupported measurement.";
    } else if (value === null) {
      result[key as MeasurementKey] = null;
    } else if (!isValidMeasurementValue(key as MeasurementKey, value)) {
      const metadata = MEASUREMENT_CATALOGUE[key as MeasurementKey];
      errors[key] = `Enter a finite value between ${metadata.min} and ${metadata.max} ${metadata.unit}.`;
    } else {
      result[key as MeasurementKey] = value;
    }
  }
  if (!Object.keys(result).length && !Object.keys(errors).length) errors.measurements = "Add at least one measurement.";
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data: result };
}

export const canonicalMeasurementValuesSchema = z.object(
  Object.fromEntries(MEASUREMENT_KEYS.map((key) => [key, z.number().finite().min(MEASUREMENT_CATALOGUE[key].min).max(MEASUREMENT_CATALOGUE[key].max).nullable().optional()])) as unknown as Record<MeasurementKey, z.ZodType>
).strict();

export function getMeasurementCapabilities(isPro: boolean) {
  const allowedKeys = MEASUREMENT_KEYS.filter((key) => isPro || MEASUREMENT_CATALOGUE[key].availability === "FREE");
  return {
    allowedKeys,
    historyLimit: isPro ? null : FREE_MEASUREMENT_HISTORY_LIMIT,
    canEstimateBodyFat: isPro,
    canViewCalculatedMetrics: isPro,
    canViewMeasurementCharts: isPro,
    canViewAdvancedComparisons: isPro,
  };
}

export function validateMeasurementCapabilities(values: unknown, isPro: boolean) {
  const validated = validateMeasurementValues(values);
  if (!validated.success) return validated;
  const allowed = new Set(getMeasurementCapabilities(isPro).allowedKeys);
  const errors = Object.fromEntries(Object.keys(validated.data).filter((key) => !allowed.has(key as MeasurementKey)).map((key) => [key, "This measurement requires Pro."]));
  return Object.keys(errors).length ? { success: false as const, errors } : validated;
}

function validInputs(inputs: Array<[MeasurementKey, number | null | undefined]>) {
  return inputs.every(([key, value]) => value != null && isValidMeasurementValue(key, value));
}

export function estimateBodyFatPercentage(values: Pick<MeasurementValues, "heightCm" | "neckCm" | "waistAtNavelCm" | "hipsCm"> & { sex: BodyFatSex | null | undefined }) {
  const { sex, heightCm, neckCm, waistAtNavelCm, hipsCm } = values;
  if (!sex || !validInputs([["heightCm", heightCm], ["neckCm", neckCm], ["waistAtNavelCm", waistAtNavelCm]])) return null;
  if (sex === "FEMALE" && !validInputs([["hipsCm", hipsCm]])) return null;
  const heightIn = centimetersToInches(heightCm!);
  const neckIn = centimetersToInches(neckCm!);
  const waistIn = centimetersToInches(waistAtNavelCm!);
  const hipsIn = hipsCm == null ? null : centimetersToInches(hipsCm);
  if (heightIn == null || neckIn == null || waistIn == null || (sex === "FEMALE" && hipsIn == null)) return null;
  const logarithmInput = sex === "MALE" ? waistIn - neckIn : waistIn + hipsIn! - neckIn;
  if (!(logarithmInput > 0)) return null;
  const result = sex === "MALE"
    ? 86.010 * Math.log10(logarithmInput) - 70.041 * Math.log10(heightIn) + 36.76
    : 163.205 * Math.log10(logarithmInput) - 97.684 * Math.log10(heightIn) - 78.387;
  return Number.isFinite(result) ? result : null;
}

export function bodyFatDisplayValue(manualBodyFatPercent: number | null | undefined, estimatedBodyFatPercent: number | null | undefined) {
  if (manualBodyFatPercent != null && isValidMeasurementValue("manualBodyFatPercent", manualBodyFatPercent)) return { value: manualBodyFatPercent, source: "manual" as const };
  if (estimatedBodyFatPercent != null && Number.isFinite(estimatedBodyFatPercent)) return { value: estimatedBodyFatPercent, source: "estimated" as const };
  return { value: null, source: "unavailable" as const };
}

export function calculateFatMassKg(bodyweightKg: number | null | undefined, bodyFatPercent: number | null | undefined) {
  if (!validInputs([["bodyweightKg", bodyweightKg], ["manualBodyFatPercent", bodyFatPercent]])) return null;
  const result = bodyweightKg! * bodyFatPercent! / 100;
  return Number.isFinite(result) ? result : null;
}

export function calculateLeanBodyMassKg(bodyweightKg: number | null | undefined, bodyFatPercent: number | null | undefined) {
  const fatMassKg = calculateFatMassKg(bodyweightKg, bodyFatPercent);
  const result = fatMassKg == null || bodyweightKg == null ? null : bodyweightKg - fatMassKg;
  return result != null && Number.isFinite(result) ? result : null;
}

export function calculateFfmi(bodyweightKg: number | null | undefined, heightCm: number | null | undefined, bodyFatPercent: number | null | undefined) {
  if (!validInputs([["heightCm", heightCm]])) return null;
  const leanBodyMassKg = calculateLeanBodyMassKg(bodyweightKg, bodyFatPercent);
  const result = leanBodyMassKg == null ? null : leanBodyMassKg / (heightCm! / 100) ** 2;
  return result != null && Number.isFinite(result) ? result : null;
}

export function calculateWaistToHeightRatio(waistAtNavelCm: number | null | undefined, heightCm: number | null | undefined) {
  if (!validInputs([["waistAtNavelCm", waistAtNavelCm], ["heightCm", heightCm]])) return null;
  const result = waistAtNavelCm! / heightCm!;
  return Number.isFinite(result) ? result : null;
}

export function calculateWaistToHipRatio(waistAtNavelCm: number | null | undefined, hipsCm: number | null | undefined) {
  if (!validInputs([["waistAtNavelCm", waistAtNavelCm], ["hipsCm", hipsCm]])) return null;
  const result = waistAtNavelCm! / hipsCm!;
  return Number.isFinite(result) ? result : null;
}

export function calculateAnthropometrySummary(values: Pick<MeasurementValues, "bodyweightKg" | "heightCm" | "manualBodyFatPercent" | "waistAtNavelCm" | "hipsCm">) {
  const bodyFatPercent = values.manualBodyFatPercent;
  return {
    fatMassKg: calculateFatMassKg(values.bodyweightKg, bodyFatPercent),
    leanBodyMassKg: calculateLeanBodyMassKg(values.bodyweightKg, bodyFatPercent),
    ffmi: calculateFfmi(values.bodyweightKg, values.heightCm, bodyFatPercent),
    waistToHeightRatio: calculateWaistToHeightRatio(values.waistAtNavelCm, values.heightCm),
    waistToHipRatio: calculateWaistToHipRatio(values.waistAtNavelCm, values.hipsCm),
  };
}
