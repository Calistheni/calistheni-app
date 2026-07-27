import { getUtcWeekStart, toUtcDateKey } from "./home-dashboard.ts";

const DAY_MS = 86_400_000;
export const MIN_WEEKLY_CARDIO_GOAL_MINUTES = 10;
export const MAX_WEEKLY_CARDIO_GOAL_MINUTES = 2_000;

const CARDIO_DURATION_TRACKING_TYPES = new Set([
  "DURATION",
  "DISTANCE_DURATION",
  "STEPS_DISTANCE_DURATION",
  "FLOORS_DISTANCE_DURATION",
  "WEIGHT_DISTANCE_DURATION",
]);

export type CardioActivityContribution = {
  workoutId: number;
  workoutTitle: string | null;
  exerciseId: string;
  exerciseName: string;
  completedAt: string;
  durationSeconds: number;
};

export type WeeklyCardioProgress = {
  completedSeconds: number;
  completedMinutes: number;
  goalMinutes: number | null;
  progressRatio: number;
  progressPercent: number;
  remainingMinutes: number;
  exceededMinutes: number;
  activeDays: number;
  sessions: number;
  weekStart: string;
  weekEnd: string;
  timeZone: string;
  activities: CardioActivityContribution[];
};

export type CardioSetEntry = {
  setId: number | string;
  workoutId: number;
  workoutTitle: string | null;
  exerciseId: string;
  exerciseName: string;
  muscle: string;
  trackingType: string;
  completedAt: Date | string;
  durationSeconds: number | null;
  completed: boolean;
};

function roundMinutes(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateCardioGoalMetrics(
  completedSeconds: number,
  goalMinutes: number | null
) {
  const completedMinutes = roundMinutes(completedSeconds / 60);
  const rawProgressRatio =
    goalMinutes && goalMinutes > 0
      ? completedSeconds / (goalMinutes * 60)
      : 0;
  const progressRatio = Math.min(Math.max(rawProgressRatio, 0), 1);

  return {
    completedMinutes,
    progressRatio,
    progressPercent: Math.round(progressRatio * 100),
    remainingMinutes:
      goalMinutes === null
        ? 0
        : roundMinutes(Math.max(goalMinutes - completedMinutes, 0)),
    exceededMinutes:
      goalMinutes === null
        ? 0
        : roundMinutes(Math.max(completedMinutes - goalMinutes, 0)),
  };
}

export function parseWeeklyCardioGoalMinutes(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) &&
    parsed >= MIN_WEEKLY_CARDIO_GOAL_MINUTES &&
    parsed <= MAX_WEEKLY_CARDIO_GOAL_MINUTES
    ? parsed
    : null;
}

/**
 * Cardio is explicit exercise metadata, not a name heuristic. A set counts
 * only when its exercise primary muscle is Cardio and its tracking type owns
 * a duration field.
 */
export function isCardioExercise({
  muscle,
  trackingType,
}: {
  muscle: string;
  trackingType: string;
}) {
  return (
    muscle.trim().toLowerCase() === "cardio" &&
    CARDIO_DURATION_TRACKING_TYPES.has(trackingType)
  );
}

export function calculateWeeklyCardioProgress({
  entries,
  goalMinutes,
  now = new Date(),
}: {
  entries: readonly CardioSetEntry[];
  goalMinutes: number | null;
  now?: Date | string;
}): WeeklyCardioProgress {
  const weekStart = getUtcWeekStart(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  const nowMs = new Date(now).getTime();
  const included = new Map<string | number, CardioSetEntry>();

  for (const entry of entries) {
    const completedAtMs = new Date(entry.completedAt).getTime();
    if (
      included.has(entry.setId) ||
      !entry.completed ||
      !entry.durationSeconds ||
      entry.durationSeconds <= 0 ||
      completedAtMs < weekStart.getTime() ||
      completedAtMs >= weekEnd.getTime() ||
      completedAtMs > nowMs ||
      !isCardioExercise(entry)
    ) {
      continue;
    }
    included.set(entry.setId, entry);
  }

  const cardioSets = [...included.values()];
  const completedSeconds = cardioSets.reduce(
    (sum, entry) => sum + (entry.durationSeconds ?? 0),
    0
  );
  const goalMetrics = calculateCardioGoalMetrics(
    completedSeconds,
    goalMinutes
  );
  const activityGroups = new Map<
    string,
    CardioActivityContribution
  >();

  for (const entry of cardioSets) {
    const key = `${entry.workoutId}:${entry.exerciseId}`;
    const current = activityGroups.get(key);
    if (current) {
      current.durationSeconds += entry.durationSeconds ?? 0;
    } else {
      activityGroups.set(key, {
        workoutId: entry.workoutId,
        workoutTitle: entry.workoutTitle,
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        completedAt: new Date(entry.completedAt).toISOString(),
        durationSeconds: entry.durationSeconds ?? 0,
      });
    }
  }

  return {
    completedSeconds,
    ...goalMetrics,
    goalMinutes,
    activeDays: new Set(
      cardioSets.map((entry) => toUtcDateKey(entry.completedAt))
    ).size,
    sessions: new Set(cardioSets.map((entry) => entry.workoutId)).size,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    timeZone: "UTC",
    activities: [...activityGroups.values()].sort((a, b) =>
      b.completedAt.localeCompare(a.completedAt)
    ),
  };
}

export function getWeeklyCardioProgressCopy(
  progress: Pick<
    WeeklyCardioProgress,
    "completedMinutes" | "goalMinutes" | "remainingMinutes" | "exceededMinutes"
  >
) {
  if (progress.goalMinutes === null) return "Set a weekly cardio goal";
  if (progress.completedMinutes === 0) return "No cardio recorded this week.";
  if (progress.exceededMinutes > 0) {
    return `${progress.exceededMinutes} minutes above goal`;
  }
  if (progress.remainingMinutes === 0) return "Weekly goal reached";
  return `${progress.remainingMinutes} minutes remaining`;
}
