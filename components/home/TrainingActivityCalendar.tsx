"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DailyWorkoutActivity } from "@/lib/home-dashboard";
import type { DailySupplementCalendarState } from "@/lib/supplement-calendar";
import {
  getTrainingActivityCellClass,
  getTrainingActivityIntensity,
  getWorkoutCalendarIntensity,
  WORKOUT_INTENSITY_CLASS,
  type TrainingActivityFilter,
} from "@/lib/training-activity-calendar";

const DAY_MS = 24 * 60 * 60 * 1000;

function buildCalendarDays(todayKey: string, weeks: number) {
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const daysUntilSunday = (7 - today.getUTCDay()) % 7;
  const end = new Date(today.getTime() + daysUntilSunday * DAY_MS);
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);

  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return date.toISOString().slice(0, 10);
  });
}

function formatCalendarDate(dateKey: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function calendarDayLabel(dateKey: string, workoutCount: number, supplements: DailySupplementCalendarState | undefined) {
  const workoutLabel = workoutCount
    ? `${workoutCount} completed workout${workoutCount === 1 ? "" : "s"}`
    : "no workout";
  const supplementLabel = supplements?.completed
    ? supplements.scheduled
      ? `${supplements.completed} of ${supplements.scheduled} scheduled supplements taken`
      : `${supplements.completed} as-needed supplement${supplements.completed === 1 ? "" : "s"} taken`
    : "no supplements taken";
  return `${formatCalendarDate(dateKey)}: ${workoutLabel}, ${supplementLabel}`;
}

function ActivityLegendCell({ intensity }: { intensity: 1 | 2 | 3 | 4 }) {
  return <span className={`size-3 rounded-[3px] ${WORKOUT_INTENSITY_CLASS[intensity]}`} aria-hidden="true" />;
}

function CalendarGrid({
  weeks,
  todayKey,
  activityByDate,
  supplementByDate,
  filter,
}: {
  weeks: number;
  todayKey: string;
  activityByDate: Map<string, DailyWorkoutActivity>;
  supplementByDate: Map<string, DailySupplementCalendarState>;
  filter: TrainingActivityFilter;
}) {
  return (
    <div
      className="grid grid-flow-col grid-rows-7 gap-1"
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {buildCalendarDays(todayKey, weeks).map((dateKey) => {
        const activity = activityByDate.get(dateKey);
        const isFuture = dateKey > todayKey;
        const workoutCount = activity?.workoutCount ?? 0;
        const supplements = supplementByDate.get(dateKey);
        const day = {
          workoutCount,
          supplementScheduledCount: supplements?.scheduled ?? 0,
          supplementCompletedCount: supplements?.completed ?? 0,
        };
        const activityIntensity = getTrainingActivityIntensity(day, filter);
        const activityClass = getTrainingActivityCellClass(day, filter);
        const filterDescription = filter === "all"
          ? "all activity"
          : filter === "workouts"
            ? "workouts"
            : filter === "supplements"
              ? "supplements"
              : "workouts and supplements";

        if (isFuture) {
          return <span key={dateKey} className="aspect-square rounded-[3px]" />;
        }

        return (
          <Popover key={dateKey}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={calendarDayLabel(dateKey, workoutCount, supplements)}
                aria-label={`${calendarDayLabel(dateKey, workoutCount, supplements)}. ${filterDescription} filter, activity level ${activityIntensity} of 4.`}
                className={`relative aspect-square min-w-0 overflow-hidden rounded-[3px] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${activityClass}`}
              />
            </PopoverTrigger>
            <PopoverContent className="max-h-72 w-64 overflow-y-auto p-3" sideOffset={8}>
              <p className="font-semibold">{formatCalendarDate(dateKey)}</p>
              {workoutCount ? <section className="mt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workout</p><p className="mt-1 text-sm">{workoutCount} completed session{workoutCount === 1 ? "" : "s"}</p><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{activity?.workouts.map((workout) => <li key={workout.id}>{workout.name}</li>)}</ul>{activity ? <p className="mt-1 text-sm text-muted-foreground">{activity.completedSets} completed sets{activity.totalVolumeKg !== null ? ` · ${Math.round(activity.totalVolumeKg).toLocaleString()} kg` : ""}</p> : null}</section> : null}
              {supplements?.scheduled || supplements?.completed ? <section className="mt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supplements</p>{supplements.completed ? <ul className="mt-1 space-y-1 text-sm text-muted-foreground">{supplements.completedSupplements.map((supplement, index) => <li key={`${supplement.name}-${index}`}>{supplement.name}{supplement.dosage ? ` — ${supplement.dosage}${supplement.unit ? ` ${supplement.unit}` : ""}` : ""}</li>)}</ul> : null}<p className="mt-1 text-sm">{supplements.scheduled ? `${supplements.completed} of ${supplements.scheduled} scheduled supplements taken` : `${supplements.completed} as-needed supplement${supplements.completed === 1 ? "" : "s"} taken`}</p></section> : null}
              {!workoutCount && !supplements?.scheduled && !supplements?.completed ? <p className="mt-2 text-sm text-muted-foreground">No activity recorded.</p> : null}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

export function TrainingActivityCalendar({
  activities,
  todayKey,
  supplementStates = [],
  hasSupplementPlans = false,
}: {
  activities: DailyWorkoutActivity[];
  todayKey: string;
  supplementStates?: DailySupplementCalendarState[];
  hasSupplementPlans?: boolean;
}) {
  const [filter, setFilter] = useState<TrainingActivityFilter>("all");
  if (activities.length === 0 && !hasSupplementPlans) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">Your calendar starts here</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Complete your first workout to start building your activity calendar.
            </p>
          </div>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/workouts/new">
            <Dumbbell className="size-4" /> Start Workout
          </Link>
        </Button>
      </div>
    );
  }

  const activityByDate = new Map(activities.map((item) => [item.date, item]));
  const supplementByDate = new Map(supplementStates.map((item) => [item.date, item]));
  const filters: Array<{ value: TrainingActivityFilter; label: string; intensity: 1 | 2 | 3 | 4 }> = [
    { value: "all", label: "All activity", intensity: 1 },
    { value: "workouts", label: "Workout completed", intensity: 1 },
    { value: "supplements", label: "Supplements taken", intensity: 1 },
    { value: "both", label: "Workout and supplements", intensity: 2 },
  ];

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Brighter blue means more activity. Days with both workouts and supplements, or multiple workouts, appear stronger.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Less
          {[0, 1, 2, 3, 4].map((count) => (
            <span
              key={count}
              className={`size-3 rounded-[3px] ${WORKOUT_INTENSITY_CLASS[getWorkoutCalendarIntensity(count)]}`}
            />
          ))}
          More
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Activity filters">
        {filters.filter((option) => hasSupplementPlans || (option.value !== "supplements" && option.value !== "both")).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            <ActivityLegendCell intensity={option.intensity} />
            {option.label}
          </button>
        ))}
      </div>

      <div className="md:hidden">
        <CalendarGrid
          weeks={12}
          todayKey={todayKey}
          activityByDate={activityByDate}
          supplementByDate={supplementByDate}
          filter={filter}
        />
      </div>
      <div className="hidden md:block">
        <CalendarGrid
          weeks={26}
          todayKey={todayKey}
          activityByDate={activityByDate}
          supplementByDate={supplementByDate}
          filter={filter}
        />
      </div>
    </div>
  );
}
