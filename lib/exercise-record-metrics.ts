import type { ExerciseTrackingType } from "@/types/workout";

export type ExerciseRecordMetricKey =
  | "maxRepsSet"
  | "totalReps"
  | "totalSets"
  | "maxWeight"
  | "maxWeightedReps"
  | "estimatedOneRepMax"
  | "maxSetVolume"
  | "workoutVolume"
  | "longestDuration"
  | "totalDuration"
  | "longestDistance"
  | "totalDistance"
  | "maxStepsSet"
  | "totalSteps"
  | "maxFloorsSet"
  | "totalFloors";

export const EXERCISE_RECORD_CHART_COLOR = "var(--primary)";

export type ExerciseRecordMetricDefinition = {
  key: ExerciseRecordMetricKey;
  label: string;
  shortLabel: string;
  unit: "reps" | "sets" | "kg" | "seconds" | "meters" | "steps" | "floors";
};

export type ExerciseRecordSetInput = {
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  steps: number | null;
  floors: number | null;
};

export type ExerciseWorkoutOccurrenceInput = {
  workoutExerciseId: number;
  workoutId: number;
  workoutTitle: string | null;
  startedAt: Date | string;
  sets: ExerciseRecordSetInput[];
};

export type ExerciseWorkoutPerformance = {
  workoutId: number;
  workoutExerciseIds: number[];
  workoutTitle: string | null;
  startedAt: string;
  values: Record<ExerciseRecordMetricKey, number | null>;
};

export type ExerciseSetVolumeCalculator = (input: {
  trackingType: ExerciseTrackingType;
  reps: number | null;
  weightKg: number | null;
  userBodyweightKg: number | null;
  bodyweightLoadFactor: number | null;
}) => number | null;

export type ExerciseBestRecord = {
  metric: ExerciseRecordMetricDefinition;
  value: number;
  achievedAt: string;
  workoutId: number;
  workoutTitle: string | null;
};

const METRICS: Record<ExerciseRecordMetricKey, ExerciseRecordMetricDefinition> = {
  maxRepsSet: {
    key: "maxRepsSet",
    label: "Max reps in one set",
    shortLabel: "Max set reps",
    unit: "reps",
  },
  totalReps: {
    key: "totalReps",
    label: "Total reps in workout",
    shortLabel: "Workout reps",
    unit: "reps",
  },
  totalSets: {
    key: "totalSets",
    label: "Completed sets in workout",
    shortLabel: "Completed sets",
    unit: "sets",
  },
  maxWeight: {
    key: "maxWeight",
    label: "Maximum weight",
    shortLabel: "Max weight",
    unit: "kg",
  },
  maxWeightedReps: {
    key: "maxWeightedReps",
    label: "Maximum weighted reps in one set",
    shortLabel: "Weighted reps",
    unit: "reps",
  },
  estimatedOneRepMax: {
    key: "estimatedOneRepMax",
    label: "Best estimated 1RM",
    shortLabel: "Estimated 1RM",
    unit: "kg",
  },
  maxSetVolume: {
    key: "maxSetVolume",
    label: "Maximum volume in one set",
    shortLabel: "Set volume",
    unit: "kg",
  },
  workoutVolume: {
    key: "workoutVolume",
    label: "Total volume in workout",
    shortLabel: "Workout volume",
    unit: "kg",
  },
  longestDuration: {
    key: "longestDuration",
    label: "Longest duration in one set",
    shortLabel: "Longest duration",
    unit: "seconds",
  },
  totalDuration: {
    key: "totalDuration",
    label: "Total duration in workout",
    shortLabel: "Workout duration",
    unit: "seconds",
  },
  longestDistance: {
    key: "longestDistance",
    label: "Longest distance in one set",
    shortLabel: "Longest distance",
    unit: "meters",
  },
  totalDistance: {
    key: "totalDistance",
    label: "Total distance in workout",
    shortLabel: "Workout distance",
    unit: "meters",
  },
  maxStepsSet: {
    key: "maxStepsSet",
    label: "Most steps in one set",
    shortLabel: "Most steps",
    unit: "steps",
  },
  totalSteps: {
    key: "totalSteps",
    label: "Total steps in workout",
    shortLabel: "Workout steps",
    unit: "steps",
  },
  maxFloorsSet: {
    key: "maxFloorsSet",
    label: "Most floors in one set",
    shortLabel: "Most floors",
    unit: "floors",
  },
  totalFloors: {
    key: "totalFloors",
    label: "Total floors in workout",
    shortLabel: "Workout floors",
    unit: "floors",
  },
};

const METRICS_BY_TRACKING_TYPE: Record<
  ExerciseTrackingType,
  ExerciseRecordMetricKey[]
> = {
  BODYWEIGHT_REPS: [
    "maxRepsSet",
    "totalReps",
    "workoutVolume",
    "maxSetVolume",
    "totalSets",
  ],
  WEIGHTED_BODYWEIGHT: [
    "maxWeight",
    "maxWeightedReps",
    "maxRepsSet",
    "totalReps",
    "workoutVolume",
    "maxSetVolume",
    "totalSets",
  ],
  EXTERNAL_WEIGHT: [
    "maxWeight",
    "estimatedOneRepMax",
    "maxWeightedReps",
    "maxRepsSet",
    "totalReps",
    "workoutVolume",
    "maxSetVolume",
    "totalSets",
  ],
  DURATION: ["longestDuration", "totalDuration", "totalSets"],
  DISTANCE_DURATION: [
    "longestDistance",
    "totalDistance",
    "longestDuration",
    "totalDuration",
    "totalSets",
  ],
  STEPS_DISTANCE_DURATION: [
    "maxStepsSet",
    "totalSteps",
    "longestDistance",
    "totalDistance",
    "longestDuration",
    "totalDuration",
    "totalSets",
  ],
  FLOORS_DISTANCE_DURATION: [
    "maxFloorsSet",
    "totalFloors",
    "longestDistance",
    "totalDistance",
    "longestDuration",
    "totalDuration",
    "totalSets",
  ],
  WEIGHT_DISTANCE_DURATION: [
    "maxWeight",
    "longestDistance",
    "totalDistance",
    "longestDuration",
    "totalDuration",
    "totalSets",
  ],
  NOT_SELECTED: Object.keys(METRICS) as ExerciseRecordMetricKey[],
};

function positive(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function maxValue(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length > 0 ? Math.max(...available) : null;
}

function sumValues(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length > 0
    ? available.reduce((sum, value) => sum + value, 0)
    : null;
}

function emptyMetricValues(): Record<ExerciseRecordMetricKey, number | null> {
  return Object.fromEntries(
    Object.keys(METRICS).map((key) => [key, null])
  ) as Record<ExerciseRecordMetricKey, number | null>;
}

function calculateWorkoutPerformance({
  trackingType,
  bodyweightLoadFactor,
  userBodyweightKg,
  calculateSetVolume,
  workoutId,
  workoutExerciseIds,
  workoutTitle,
  startedAt,
  sets,
}: {
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  userBodyweightKg: number | null;
  calculateSetVolume: ExerciseSetVolumeCalculator;
  workoutId: number;
  workoutExerciseIds: number[];
  workoutTitle: string | null;
  startedAt: Date;
  sets: ExerciseRecordSetInput[];
}): ExerciseWorkoutPerformance {
  const values = emptyMetricValues();
  const reps = sets.map((set) => positive(set.reps));
  const weights = sets.map((set) => positive(set.weight));
  const durations = sets.map((set) => positive(set.durationSeconds));
  const distances = sets.map((set) => positive(set.distanceMeters));
  const steps = sets.map((set) => positive(set.steps));
  const floors = sets.map((set) => positive(set.floors));

  values.totalSets = sets.length;
  values.maxRepsSet = maxValue(reps);
  values.totalReps = sumValues(reps);
  values.maxWeight = maxValue(weights);
  values.longestDuration = maxValue(durations);
  values.totalDuration = sumValues(durations);
  values.longestDistance = maxValue(distances);
  values.totalDistance = sumValues(distances);
  values.maxStepsSet = maxValue(steps);
  values.totalSteps = sumValues(steps);
  values.maxFloorsSet = maxValue(floors);
  values.totalFloors = sumValues(floors);

  const weightedReps = sets
    .filter((set) => positive(set.weight) !== null)
    .map((set) => positive(set.reps));
  values.maxWeightedReps = maxValue(weightedReps);

  if (trackingType === "EXTERNAL_WEIGHT") {
    values.estimatedOneRepMax = maxValue(
      sets.map((set) => {
        const weight = positive(set.weight);
        const setReps = positive(set.reps);
        return weight !== null && setReps !== null
          ? weight * (1 + setReps / 30)
          : null;
      })
    );
  }

  let volumeAvailable = true;
  let workoutVolume = 0;
  let maxSetVolume: number | null = null;
  for (const set of sets) {
    const setVolume = calculateSetVolume({
      trackingType,
      reps: set.reps,
      weightKg: set.weight,
      userBodyweightKg,
      bodyweightLoadFactor,
    });

    if (setVolume === null) {
      volumeAvailable = false;
      continue;
    }

    workoutVolume += setVolume;
    if (setVolume > 0) {
      maxSetVolume = Math.max(maxSetVolume ?? 0, setVolume);
    }
  }
  if (volumeAvailable && workoutVolume > 0) {
    values.workoutVolume = workoutVolume;
    values.maxSetVolume = maxSetVolume;
  }

  return {
    workoutId,
    workoutExerciseIds,
    workoutTitle,
    startedAt: startedAt.toISOString(),
    values,
  };
}

export function getExerciseWorkoutMetrics({
  trackingType,
  bodyweightLoadFactor,
  userBodyweightKg,
  calculateSetVolume,
  occurrences,
}: {
  trackingType: ExerciseTrackingType;
  bodyweightLoadFactor: number | null;
  userBodyweightKg: number | null;
  calculateSetVolume: ExerciseSetVolumeCalculator;
  occurrences: ExerciseWorkoutOccurrenceInput[];
}) {
  const workouts = new Map<
    number,
    {
      workoutExerciseIds: number[];
      workoutTitle: string | null;
      startedAt: Date;
      sets: ExerciseRecordSetInput[];
    }
  >();

  for (const occurrence of occurrences) {
    const existing = workouts.get(occurrence.workoutId);
    if (existing) {
      existing.workoutExerciseIds.push(occurrence.workoutExerciseId);
      existing.sets.push(...occurrence.sets);
      continue;
    }

    workouts.set(occurrence.workoutId, {
      workoutExerciseIds: [occurrence.workoutExerciseId],
      workoutTitle: occurrence.workoutTitle,
      startedAt: new Date(occurrence.startedAt),
      sets: [...occurrence.sets],
    });
  }

  return [...workouts.entries()]
    .map(([workoutId, workout]) =>
      calculateWorkoutPerformance({
        trackingType,
        bodyweightLoadFactor,
        userBodyweightKg,
        calculateSetVolume,
        workoutId,
        ...workout,
      })
    )
    .sort(
      (left, right) =>
        new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime() ||
        left.workoutId - right.workoutId
    );
}

export function getExerciseMetricDefinitions(
  trackingType: ExerciseTrackingType,
  performances: ExerciseWorkoutPerformance[]
) {
  return METRICS_BY_TRACKING_TYPE[trackingType]
    .filter((key) =>
      performances.some((performance) => performance.values[key] !== null)
    )
    .map((key) => {
      if (key === "maxWeight" && trackingType === "WEIGHTED_BODYWEIGHT") {
        return {
          ...METRICS[key],
          label: "Maximum added weight",
          shortLabel: "Added weight",
        };
      }

      if (key === "maxWeight" && trackingType === "WEIGHT_DISTANCE_DURATION") {
        return {
          ...METRICS[key],
          label: "Maximum carried weight",
          shortLabel: "Carried weight",
        };
      }

      return METRICS[key];
    });
}

export function getExercisePersonalRecords(
  performances: ExerciseWorkoutPerformance[],
  metrics: ExerciseRecordMetricDefinition[]
) {
  return metrics.flatMap((metric): ExerciseBestRecord[] => {
    let best: ExerciseBestRecord | null = null;
    for (const performance of performances) {
      const value = performance.values[metric.key];
      if (value === null || (best !== null && value <= best.value)) {
        continue;
      }
      best = {
        metric,
        value,
        achievedAt: performance.startedAt,
        workoutId: performance.workoutId,
        workoutTitle: performance.workoutTitle,
      };
    }
    return best ? [best] : [];
  });
}

export function getExerciseRecordHistory(
  performances: ExerciseWorkoutPerformance[],
  metrics: ExerciseRecordMetricDefinition[]
) {
  const bestValues = new Map<ExerciseRecordMetricKey, number>();
  const history: ExerciseBestRecord[] = [];

  for (const performance of performances) {
    for (const metric of metrics) {
      const value = performance.values[metric.key];
      const previousBest = bestValues.get(metric.key);
      if (value === null || (previousBest !== undefined && value <= previousBest)) {
        continue;
      }
      bestValues.set(metric.key, value);
      history.push({
        metric,
        value,
        achievedAt: performance.startedAt,
        workoutId: performance.workoutId,
        workoutTitle: performance.workoutTitle,
      });
    }
  }

  return history;
}

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes === 0) return `${remainingSeconds} sec`;
  return remainingSeconds === 0
    ? `${minutes} min`
    : `${minutes}m ${remainingSeconds}s`;
}

export function formatExerciseRecordMetricValue(
  metric: Pick<ExerciseRecordMetricDefinition, "unit">,
  value: number
) {
  switch (metric.unit) {
    case "kg":
      return `${Math.round(value * 10) / 10} kg`;
    case "seconds":
      return formatDuration(value);
    case "meters":
      return value >= 1_000
        ? `${Math.round((value / 1_000) * 100) / 100} km`
        : `${Math.round(value)} m`;
    case "reps":
      return `${Math.round(value).toLocaleString()} reps`;
    case "sets":
      return `${Math.round(value).toLocaleString()} sets`;
    case "steps":
      return `${Math.round(value).toLocaleString()} steps`;
    case "floors":
      return `${Math.round(value).toLocaleString()} floors`;
  }
}
