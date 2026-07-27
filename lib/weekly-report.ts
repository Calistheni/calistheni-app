import {
  aggregateCompletedSetsByMuscle,
  getMuscleWorkloadSummary,
  type MuscleWorkloadPoint,
} from "./muscle-activity.ts";

const DAY_MS = 86_400_000;

export type WeeklyReportWorkout = {
  id: number;
  startedAt: Date | string;
  completedAt: Date | string | null;
  totalVolumeKg: number | null;
  sets: Array<{
    id: number;
    completed: boolean;
    reps: number | null;
    primaryMuscle: string;
    secondaryMuscles: readonly string[];
  }>;
};

export type WeeklyReportPeriod = {
  workouts: number;
  completedSets: number;
  totalReps: number;
  totalVolumeKg: number | null;
  activeDays: number;
  durationSeconds: number;
  muscleWorkload: MuscleWorkloadPoint[];
  mostTrainedMuscle: MuscleWorkloadPoint | null;
};

function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function summarizePeriod(
  workouts: WeeklyReportWorkout[],
  startMs: number,
  endMs: number
): WeeklyReportPeriod {
  const included = workouts.filter((workout) => {
    if (!workout.completedAt) return false;
    const completedAt = new Date(workout.completedAt).getTime();
    return completedAt >= startMs && completedAt < endMs;
  });
  const completedSets = included.flatMap((workout) =>
    workout.sets.filter((set) => set.completed)
  );
  const muscleWorkload = aggregateCompletedSetsByMuscle(
    completedSets.map((set) => ({
      aggregationId: set.id,
      primaryMuscle: set.primaryMuscle,
      secondaryMuscles: set.secondaryMuscles,
    }))
  );
  const availableVolumes = included.map((workout) => workout.totalVolumeKg);
  const totalVolumeKg =
    availableVolumes.length > 0 &&
    availableVolumes.every((volume) => volume !== null)
      ? availableVolumes.reduce<number>(
          (sum, volume) => sum + (volume ?? 0),
          0
        )
      : null;

  return {
    workouts: included.length,
    completedSets: completedSets.length,
    totalReps: completedSets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    totalVolumeKg,
    activeDays: new Set(
      included.map((workout) =>
        utcDateKey(new Date(workout.completedAt as Date | string))
      )
    ).size,
    durationSeconds: included.reduce((sum, workout) => {
      const duration =
        new Date(workout.completedAt as Date | string).getTime() -
        new Date(workout.startedAt).getTime();
      return sum + (Number.isFinite(duration) && duration > 0 ? duration / 1000 : 0);
    }, 0),
    muscleWorkload,
    mostTrainedMuscle:
      getMuscleWorkloadSummary(muscleWorkload).find(
        (point) => point.workloadScore > 0
      ) ?? null,
  };
}

export function getWeeklyReportComparison(
  current: number,
  previous: number
) {
  if (previous === 0) {
    return current === 0
      ? { kind: "unchanged" as const, percentage: null }
      : { kind: "new-activity" as const, percentage: null };
  }

  const percentage = Math.round(((current - previous) / previous) * 100);
  return {
    kind:
      percentage === 0
        ? ("unchanged" as const)
        : percentage > 0
          ? ("increase" as const)
          : ("decrease" as const),
    percentage,
  };
}

export function calculateWeeklyReport({
  workouts,
  weekStart,
}: {
  workouts: WeeklyReportWorkout[];
  weekStart: Date | string;
}) {
  const currentStart = new Date(weekStart).getTime();
  const currentEnd = currentStart + 7 * DAY_MS;
  const previousStart = currentStart - 7 * DAY_MS;
  const current = summarizePeriod(workouts, currentStart, currentEnd);
  const previous = summarizePeriod(workouts, previousStart, currentStart);

  return {
    current,
    previous,
    comparisons: {
      workouts: getWeeklyReportComparison(
        current.workouts,
        previous.workouts
      ),
      completedSets: getWeeklyReportComparison(
        current.completedSets,
        previous.completedSets
      ),
      activeDays: getWeeklyReportComparison(
        current.activeDays,
        previous.activeDays
      ),
      volume:
        current.totalVolumeKg === null || previous.totalVolumeKg === null
          ? null
          : getWeeklyReportComparison(
              current.totalVolumeKg,
              previous.totalVolumeKg
            ),
    },
  };
}
