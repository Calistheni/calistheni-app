import type { ExerciseTrackingType, WorkoutSetInput } from "@/types/workout";
import type { PersonalRecordValueMap } from "@/lib/personal-record-rules";
import {
  formatDistance,
  formatWeight,
  type MeasurementSystem,
} from "@/lib/measurement-units";

export type WorkoutPerformanceMetric =
  | "reps"
  | "weight"
  | "durationSeconds"
  | "distanceMeters"
  | "steps"
  | "floors";

export type ExercisePerformanceReference = {
  personalRecords?: PersonalRecordValueMap;
  personalBest: Partial<Record<WorkoutPerformanceMetric, number>>;
  previousWorkout: {
    sets: Array<
      Partial<Record<WorkoutPerformanceMetric, number>> & { rpe?: number }
    >;
    fallbackBest: Partial<Record<WorkoutPerformanceMetric, number>>;
  } | null;
  personalRecordContext?: ExercisePersonalRecordContext;
};

export type ExercisePerformanceReferenceMap = Record<
  string,
  ExercisePerformanceReference
>;

const METRIC_LABELS: Record<WorkoutPerformanceMetric, string> = {
  reps: "repetitions",
  weight: "kg",
  durationSeconds: "sec",
  distanceMeters: "m",
  steps: "steps",
  floors: "floors",
};

type HistoricalSet = Partial<Record<WorkoutPerformanceMetric, number | null>> & {
  rpe?: number | null;
};

export type ExercisePersonalRecordContext = {
  maxReps: number | null;
  repsByWeight: Record<string, number>;
  longestDuration: number | null;
  longestDistance: number | null;
  maxSteps: number | null;
  maxFloors: number | null;
};

export type ActiveSetPersonalRecordDisplay = {
  value: string | null;
  isNew: boolean;
  newValue?: string | null;
  label: string;
};

function maxPositive(values: Array<number | null | undefined>) {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );
  return valid.length ? Math.max(...valid) : null;
}

export function getWeightBucket(weight: number) {
  return String(Math.round(weight * 100) / 100);
}

export function buildExercisePersonalRecordContext(
  sets: HistoricalSet[],
  persistedRecords: PersonalRecordValueMap = {}
): ExercisePersonalRecordContext {
  const repsByWeight: Record<string, number> = {};
  for (const set of sets) {
    if (typeof set.weight !== "number" || set.weight <= 0 || typeof set.reps !== "number" || set.reps <= 0) continue;
    const bucket = getWeightBucket(set.weight);
    repsByWeight[bucket] = Math.max(repsByWeight[bucket] ?? 0, set.reps);
  }
  return {
    maxReps: persistedRecords.MAX_REPS ?? maxPositive(sets.map((set) => set.reps)),
    repsByWeight,
    longestDuration: persistedRecords.LONGEST_DURATION ?? maxPositive(sets.map((set) => set.durationSeconds)),
    longestDistance: maxPositive(sets.map((set) => set.distanceMeters)),
    maxSteps: maxPositive(sets.map((set) => set.steps)),
    maxFloors: maxPositive(sets.map((set) => set.floors)),
  };
}

export function getActiveSetPersonalRecordDisplay({
  context,
  trackingType,
  set,
  previousWeight,
  measurementSystem = "METRIC",
}: {
  context: ExercisePersonalRecordContext | undefined;
  trackingType: ExerciseTrackingType;
  set: WorkoutSetInput;
  previousWeight?: number | null;
  measurementSystem?: MeasurementSystem;
}): ActiveSetPersonalRecordDisplay | null {
  if (!context) return null;
  const weighted = trackingType === "EXTERNAL_WEIGHT" || trackingType === "WEIGHTED_BODYWEIGHT";
  if (weighted) {
    const effectiveWeight =
      typeof set.weight === "number" && set.weight > 0
        ? set.weight
        : typeof previousWeight === "number" && previousWeight > 0
          ? previousWeight
          : null;
    if (effectiveWeight === null) return null;
    const record = context.repsByWeight[getWeightBucket(effectiveWeight)] ?? null;
    return {
      value: record === null ? null : formatWeightedPerformance({ weight: effectiveWeight, reps: record, measurementSystem }),
      isNew: typeof set.reps === "number" && set.reps > 0 && (record === null || set.reps > record),
      newValue: typeof set.reps === "number" && set.reps > 0 ? formatWeightedPerformance({ weight: effectiveWeight, reps: set.reps, measurementSystem }) : null,
      label: `All-time best performance at ${formatWeight(effectiveWeight, measurementSystem)}`,
    };
  }
  if (trackingType === "BODYWEIGHT_REPS" || trackingType === "NOT_SELECTED") {
    const record = context.maxReps;
    return { value: record === null ? null : `${record}`, isNew: typeof set.reps === "number" && set.reps > 0 && (record === null || set.reps > record), label: "All-time best reps for this exercise" };
  }
  if (trackingType === "DURATION") {
    const record = context.longestDuration;
    return { value: record === null ? null : formatPerformanceReferenceValue("durationSeconds", record), isNew: typeof set.durationSeconds === "number" && set.durationSeconds > 0 && (record === null || set.durationSeconds > record), label: "All-time longest duration for this exercise" };
  }
  if (typeof set.distanceMeters === "number" && set.distanceMeters > 0) {
    const record = context.longestDistance;
    return { value: record === null ? null : formatDistance(record, measurementSystem), isNew: record === null || set.distanceMeters > record, label: "All-time longest distance for this exercise" };
  }
  if (trackingType === "STEPS_DISTANCE_DURATION") {
    const record = context.maxSteps;
    return { value: record === null ? null : `${record}`, isNew: typeof set.steps === "number" && set.steps > 0 && (record === null || set.steps > record), label: "All-time most steps for this exercise" };
  }
  if (trackingType === "FLOORS_DISTANCE_DURATION") {
    const record = context.maxFloors;
    return { value: record === null ? null : `${record}`, isNew: typeof set.floors === "number" && set.floors > 0 && (record === null || set.floors > record), label: "All-time most floors for this exercise" };
  }
  const record = context.longestDistance;
  return { value: record === null ? null : formatDistance(record, measurementSystem), isNew: false, label: "All-time longest distance for this exercise" };
}

function isPerformanceValue(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function formatPerformanceReferenceValue(
  metric: WorkoutPerformanceMetric,
  value: number
) {
  if (metric === "durationSeconds") {
    const rounded = Math.round(value);
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  if (metric === "distanceMeters") {
    return value >= 1000
      ? `${Math.round((value / 1000) * 100) / 100} km`
      : `${Math.round(value)} m`;
  }
  if (metric === "weight") return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value)}`;
}

export function formatWeightedPerformance({
  weight,
  reps,
  measurementSystem = "METRIC",
}: {
  weight: number;
  reps: number;
  measurementSystem?: MeasurementSystem;
}) {
  return `${formatWeight(weight, measurementSystem)} × ${formatPerformanceReferenceValue("reps", reps)}`;
}

function formatAccessiblePerformanceReferenceValue(
  metric: WorkoutPerformanceMetric,
  value: number
) {
  if (metric === "durationSeconds") {
    const rounded = Math.round(value);
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return minutes > 0 ? `${minutes} minutes ${seconds} seconds` : `${seconds} seconds`;
  }
  if (metric === "distanceMeters") return formatPerformanceReferenceValue(metric, value);
  if (metric === "weight") return `${Math.round(value * 10) / 10} kilograms`;
  return `${Math.round(value)} ${METRIC_LABELS[metric]}`;
}

export function getPerformanceReference(
  reference: ExercisePerformanceReference | undefined,
  metric: WorkoutPerformanceMetric,
  setIndex: number,
  fallback: string
) {
  const pr = reference?.personalBest[metric];
  const previousByPosition = reference?.previousWorkout?.sets[setIndex]?.[metric];
  const previous = isPerformanceValue(previousByPosition)
    ? previousByPosition
    : reference?.previousWorkout?.fallbackBest[metric];
  const parts = [
    isPerformanceValue(pr) ? `PR ${formatPerformanceReferenceValue(metric, pr)}` : null,
    isPerformanceValue(previous)
      ? `PREV ${formatPerformanceReferenceValue(metric, previous)}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : fallback;
}

export function getPerformanceReferenceDescription(
  reference: ExercisePerformanceReference | undefined,
  metric: WorkoutPerformanceMetric,
  setIndex: number
) {
  const pr = reference?.personalBest[metric];
  const previousByPosition = reference?.previousWorkout?.sets[setIndex]?.[metric];
  const previous = isPerformanceValue(previousByPosition)
    ? previousByPosition
    : reference?.previousWorkout?.fallbackBest[metric];
  const values = [
    isPerformanceValue(pr)
      ? `All-time personal record: ${formatAccessiblePerformanceReferenceValue(metric, pr)}.`
      : null,
    isPerformanceValue(previous)
      ? `Previous workout: ${formatAccessiblePerformanceReferenceValue(metric, previous)}.`
      : null,
  ].filter(Boolean);
  return values.join(" ") || undefined;
}

export function toPerformanceReferenceSet(set: WorkoutSetInput) {
  return {
    reps: set.reps ?? undefined,
    weight: set.weight ?? undefined,
    durationSeconds: set.durationSeconds ?? undefined,
    distanceMeters: set.distanceMeters ?? undefined,
    steps: set.steps ?? undefined,
    floors: set.floors ?? undefined,
  };
}
