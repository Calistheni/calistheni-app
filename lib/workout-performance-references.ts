import type { WorkoutSetInput } from "@/types/workout";

export type WorkoutPerformanceMetric =
  | "reps"
  | "weight"
  | "durationSeconds"
  | "distanceMeters"
  | "steps"
  | "floors";

export type ExercisePerformanceReference = {
  personalBest: Partial<Record<WorkoutPerformanceMetric, number>>;
  previousWorkout: {
    sets: Array<Partial<Record<WorkoutPerformanceMetric, number>>>;
    fallbackBest: Partial<Record<WorkoutPerformanceMetric, number>>;
  } | null;
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
