import type { AppleHealthBodyMeasurementPayload } from "@/lib/native/apple-health";

type MeasurementEntry = {
  id: string;
  measuredAt: string | Date;
  source?: "MANUAL" | "APPLE_HEALTH";
  healthExportKinds?: string[];
  bodyweightKg?: unknown;
  bodyFatPercentage?: unknown;
  waistCm?: unknown;
  heightCm?: unknown;
};

function numberValue(value: unknown) {
  const result = Number(typeof value === "object" && value !== null && "toString" in value ? value.toString() : value);
  return Number.isFinite(result) ? result : null;
}

/** Builds only direct, user-recorded HealthKit quantity samples. Derived lean mass is intentionally excluded. */
export function getAppleHealthMeasurementPayloads(entry: MeasurementEntry, isPro = false): AppleHealthBodyMeasurementPayload[] {
  if (entry.source === "APPLE_HEALTH") return [];
  const measuredAtMs = new Date(entry.measuredAt).getTime();
  if (!Number.isFinite(measuredAtMs)) return [];
  const candidates: Array<[AppleHealthBodyMeasurementPayload["kind"], unknown]> = [
    ["BODY_WEIGHT", entry.bodyweightKg],
    ...(isPro ? [["BODY_FAT", entry.bodyFatPercentage] as [AppleHealthBodyMeasurementPayload["kind"], unknown]] : []),
    ["WAIST", entry.waistCm],
    ...(isPro ? [["HEIGHT", entry.heightCm] as [AppleHealthBodyMeasurementPayload["kind"], unknown]] : []),
  ];
  return candidates.flatMap(([kind, value]) => {
    if (entry.healthExportKinds && !entry.healthExportKinds.includes(kind)) return [];
    const canonicalValue = numberValue(value);
    return canonicalValue == null ? [] : [{ measurementId: entry.id, kind, canonicalValue, measuredAtMs }];
  });
}
