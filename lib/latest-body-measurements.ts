import type {
  MeasurementField,
  MeasurementSnapshotValues,
} from "@/lib/progress";

type NumericValue = number | string | { toString(): string } | null | undefined;
export type BodyMeasurementEntryLike = {
  measuredAt: string | Date;
  createdAt?: string | Date;
  bodyweightKg?: NumericValue;
  bodyFatPercentage?: NumericValue;
  heightCm?: NumericValue;
  neckCm?: NumericValue;
  shouldersCm?: NumericValue;
  chestCm?: NumericValue;
  waistCm?: NumericValue;
  hipsCm?: NumericValue;
  bicepsCm?: NumericValue;
  forearmCm?: NumericValue;
  wristCm?: NumericValue;
  thighCm?: NumericValue;
  calfCm?: NumericValue;
  ankleCm?: NumericValue;
  leftUpperArmCm?: NumericValue;
  rightUpperArmCm?: NumericValue;
  leftForearmCm?: NumericValue;
  rightForearmCm?: NumericValue;
  leftThighCm?: NumericValue;
  rightThighCm?: NumericValue;
  leftCalfCm?: NumericValue;
  rightCalfCm?: NumericValue;
};

export type LatestMeasurementState = Required<
  Pick<MeasurementSnapshotValues, MeasurementField>
> & { sources: Partial<Record<MeasurementField, Date>> };

function asNumber(value: NumericValue) {
  const number = Number(
    typeof value === "object" && value !== null && "toString" in value
      ? value.toString()
      : value
  );
  return Number.isFinite(number) ? number : null;
}
function entryDate(entry: BodyMeasurementEntryLike) {
  const date = new Date(entry.measuredAt);
  return Number.isFinite(date.getTime()) ? date : null;
}
function valueFor(entry: BodyMeasurementEntryLike, field: MeasurementField) {
  switch (field) {
    case "bicepsCm":
      return (
        asNumber(entry.bicepsCm) ??
        asNumber(entry.leftUpperArmCm) ??
        asNumber(entry.rightUpperArmCm)
      );
    case "forearmCm":
      return (
        asNumber(entry.forearmCm) ??
        asNumber(entry.leftForearmCm) ??
        asNumber(entry.rightForearmCm)
      );
    case "thighCm":
      return (
        asNumber(entry.thighCm) ??
        asNumber(entry.leftThighCm) ??
        asNumber(entry.rightThighCm)
      );
    case "calfCm":
      return (
        asNumber(entry.calfCm) ??
        asNumber(entry.leftCalfCm) ??
        asNumber(entry.rightCalfCm)
      );
    default:
      return asNumber(entry[field]);
  }
}

/** Resolves each current value independently. A newer weight-only check-in can
 * never erase an older height, neck, or waist from the current state. */
export function resolveLatestMeasurementState(
  entries: readonly BodyMeasurementEntryLike[]
): LatestMeasurementState {
  const ordered = [...entries].sort((left, right) => {
    const dateDifference =
      (entryDate(right)?.getTime() ?? 0) - (entryDate(left)?.getTime() ?? 0);
    return (
      dateDifference ||
      (new Date(right.createdAt ?? 0).getTime() || 0) -
        (new Date(left.createdAt ?? 0).getTime() || 0)
    );
  });
  const state: MeasurementSnapshotValues = {};
  const sources: Partial<Record<MeasurementField, Date>> = {};
  const fields: MeasurementField[] = [
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
  ];
  for (const field of fields) {
    for (const entry of ordered) {
      const value = valueFor(entry, field);
      const measuredAt = entryDate(entry);
      if (value != null && measuredAt) {
        state[field] = value;
        sources[field] = measuredAt;
        break;
      }
    }
  }
  return { ...state, sources } as LatestMeasurementState;
}

export function latestMeasurementSnapshot(
  entries: readonly BodyMeasurementEntryLike[]
): MeasurementSnapshotValues {
  const state = resolveLatestMeasurementState(entries);
  const { sources, ...snapshot } = state;
  void sources;
  return snapshot;
}

const STATE_FIELDS: MeasurementField[] = [
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
];
export function diffMeasurementState(
  previous: MeasurementSnapshotValues,
  next: MeasurementSnapshotValues
) {
  return STATE_FIELDS.filter((field) => {
    const before = previous[field];
    const after = next[field];
    if (after == null) return before != null;
    return before == null || Math.abs(Number(after) - Number(before)) > 1e-9;
  });
}
export function resolveMeasurementHistory<T extends BodyMeasurementEntryLike>(
  entries: readonly T[]
) {
  const ordered = [...entries].sort(
    (left, right) =>
      (entryDate(left)?.getTime() ?? 0) - (entryDate(right)?.getTime() ?? 0)
  );
  let previous: MeasurementSnapshotValues = {};
  return ordered.map((entry, index) => {
    const snapshot = latestMeasurementSnapshot(ordered.slice(0, index + 1));
    const changedFields = diffMeasurementState(previous, snapshot);
    const result = { entry, snapshot, changedFields, previous };
    previous = snapshot;
    return result;
  });
}
