export type CalendarActivityIntensity = 0 | 1 | 2 | 3 | 4;

export type TrainingActivityFilter = "all" | "workouts" | "supplements" | "both";

export type TrainingActivityDayInput = {
  workoutCount: number;
  supplementScheduledCount: number;
  supplementCompletedCount: number;
};

export const WORKOUT_INTENSITY_CLASS: Record<CalendarActivityIntensity, string> = {
  0: "bg-muted/60",
  1: "bg-primary/30",
  2: "bg-primary/55",
  3: "bg-primary/75",
  4: "bg-primary",
};

export function getWorkoutCalendarIntensity(workoutCount: number): CalendarActivityIntensity {
  if (workoutCount >= 4) return 4;
  if (workoutCount === 3) return 3;
  if (workoutCount === 2) return 2;
  return workoutCount === 1 ? 1 : 0;
}

export function getSupplementCalendarIntensity({
  completed,
}: {
  scheduled: number;
  completed: number;
}): CalendarActivityIntensity {
  // A completed dose is the same base activity as one completed workout;
  // adherence and pill count do not increase calendar brightness.
  return completed > 0 ? 1 : 0;
}

export function hasWorkoutActivity(day: TrainingActivityDayInput) {
  return day.workoutCount > 0;
}

export function hasSupplementActivity(day: TrainingActivityDayInput) {
  return day.supplementCompletedCount > 0;
}

export function matchesTrainingActivityFilter(
  day: TrainingActivityDayInput,
  filter: TrainingActivityFilter
) {
  const hasWorkout = hasWorkoutActivity(day);
  const hasSupplements = hasSupplementActivity(day);
  if (filter === "workouts") return hasWorkout;
  if (filter === "supplements") return hasSupplements;
  if (filter === "both") return hasWorkout && hasSupplements;
  return hasWorkout || hasSupplements;
}

/**
 * Returns the existing blue heatmap level for the selected lens. In the all
 * lens, a combined day is always brighter than either single activity type.
 */
export function getTrainingActivityIntensity(
  day: TrainingActivityDayInput,
  filter: TrainingActivityFilter
): CalendarActivityIntensity {
  const hasWorkout = hasWorkoutActivity(day);
  const hasSupplements = hasSupplementActivity(day);
  if (!matchesTrainingActivityFilter(day, filter)) return 0;

  if (filter === "workouts") return getWorkoutCalendarIntensity(day.workoutCount);
  if (filter === "supplements") {
    return getSupplementCalendarIntensity({
      scheduled: day.supplementScheduledCount,
      completed: day.supplementCompletedCount,
    });
  }
  if (filter === "both") {
    if (day.workoutCount >= 3) return 4;
    return day.workoutCount === 2 ? 3 : 2;
  }

  if (hasWorkout && hasSupplements) {
    if (day.workoutCount >= 3) return 4;
    return day.workoutCount === 2 ? 3 : 2;
  }
  if (hasWorkout) return getWorkoutCalendarIntensity(day.workoutCount);
  return getSupplementCalendarIntensity({
    scheduled: day.supplementScheduledCount,
    completed: day.supplementCompletedCount,
  });
}

export function getTrainingActivityCellClass(
  day: TrainingActivityDayInput,
  filter: TrainingActivityFilter
) {
  const intensity = getTrainingActivityIntensity(day, filter);
  const hasAnyActivity = hasWorkoutActivity(day) || hasSupplementActivity(day);
  if (filter !== "all" && hasAnyActivity && intensity === 0) return "bg-muted/30 opacity-45";
  return WORKOUT_INTENSITY_CLASS[intensity];
}
