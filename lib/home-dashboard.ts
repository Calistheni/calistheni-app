const DAY_MS = 24 * 60 * 60 * 1000;

export type CompletedWorkoutActivityInput = {
  id?: number | string;
  title?: string | null;
  completedAt: Date | string | null;
  completedSets?: number;
  totalVolumeKg?: number | null;
};

export type DailyWorkoutActivity = {
  date: string;
  workoutCount: number;
  completedSets: number;
  totalVolumeKg: number | null;
  workouts: Array<{ id: string; name: string; completedAt: string }>;
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function toUtcDateKey(value: Date | string) {
  return asDate(value).toISOString().slice(0, 10);
}

export function getUtcWeekStart(value: Date | string) {
  const date = asDate(value);
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

/** Returns the exact UTC range rendered by the 26-week training activity grid. */
export function getTrainingActivityCalendarRange(value: Date | string, weeks = 26) {
  const today = new Date(`${toUtcDateKey(value)}T00:00:00.000Z`);
  const daysUntilSunday = (7 - today.getUTCDay()) % 7;
  const end = new Date(today.getTime() + (daysUntilSunday + 1) * DAY_MS);
  const start = new Date(end.getTime() - weeks * 7 * DAY_MS);
  return { start, end };
}

export function parseWeeklyWorkoutGoal(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : null;
}

export function countCurrentWeekCompletedWorkouts(
  workouts: CompletedWorkoutActivityInput[],
  now: Date | string = new Date()
) {
  const start = getUtcWeekStart(now).getTime();
  const end = start + 7 * DAY_MS;

  return workouts.filter((workout) => {
    if (!workout.completedAt) return false;
    const completedAt = asDate(workout.completedAt).getTime();
    return completedAt >= start && completedAt < end;
  }).length;
}

export function calculateCurrentWorkoutStreak(
  workouts: CompletedWorkoutActivityInput[],
  today: Date | string = new Date()
) {
  const activeDates = new Set(
    workouts.flatMap((workout) =>
      workout.completedAt ? [toUtcDateKey(workout.completedAt)] : []
    )
  );
  const cursor = new Date(`${toUtcDateKey(today)}T00:00:00.000Z`);

  if (!activeDates.has(toUtcDateKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (activeDates.has(toUtcDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export function groupCompletedWorkoutActivity(
  workouts: CompletedWorkoutActivityInput[]
): DailyWorkoutActivity[] {
  const byDate = new Map<
    string,
    DailyWorkoutActivity & { availableVolumeCount: number }
  >();

  for (const workout of workouts) {
    if (!workout.completedAt) continue;
    const date = toUtcDateKey(workout.completedAt);
    const current = byDate.get(date) ?? {
      date,
      workoutCount: 0,
      completedSets: 0,
      totalVolumeKg: 0,
      availableVolumeCount: 0,
      workouts: [],
    };

    current.workoutCount += 1;
    current.workouts.push({
      id: String(workout.id ?? `${date}-${current.workoutCount}`),
      name: workout.title?.trim() || "Workout",
      completedAt: asDate(workout.completedAt).toISOString(),
    });
    current.completedSets += workout.completedSets ?? 0;
    if (workout.totalVolumeKg !== null && workout.totalVolumeKg !== undefined) {
      current.totalVolumeKg =
        (current.totalVolumeKg ?? 0) + workout.totalVolumeKg;
      current.availableVolumeCount += 1;
    }
    byDate.set(date, current);
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ availableVolumeCount, ...activity }) => ({
      ...activity,
      totalVolumeKg: availableVolumeCount > 0 ? activity.totalVolumeKg : null,
    }));
}

export function calculateFourWeekGoalConsistency({
  workouts,
  weeklyGoal,
  now = new Date(),
  historyStart,
}: {
  workouts: CompletedWorkoutActivityInput[];
  weeklyGoal: number;
  now?: Date | string;
  historyStart: Date | string;
}) {
  const goal = parseWeeklyWorkoutGoal(weeklyGoal);
  if (goal === null) return null;

  const currentWeekStart = getUtcWeekStart(now).getTime();
  const firstIncludedWeekStart = currentWeekStart - 4 * 7 * DAY_MS;

  // Consistency uses the four fully completed calendar weeks before this week.
  // New accounts without four complete weeks return an honest unavailable state.
  if (asDate(historyStart).getTime() > firstIncludedWeekStart) {
    return null;
  }

  let metWeeks = 0;
  for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
    const start = firstIncludedWeekStart + weekIndex * 7 * DAY_MS;
    const end = start + 7 * DAY_MS;
    const completedCount = workouts.filter((workout) => {
      if (!workout.completedAt) return false;
      const completedAt = asDate(workout.completedAt).getTime();
      return completedAt >= start && completedAt < end;
    }).length;

    if (completedCount >= goal) metWeeks += 1;
  }

  return {
    metWeeks,
    totalWeeks: 4,
    percentage: Math.round((metWeeks / 4) * 100),
  };
}
