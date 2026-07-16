"use client";

import Link from "next/link";
import { CalendarDays, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DailyWorkoutActivity } from "@/lib/home-dashboard";

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

function intensityClass(workoutCount: number) {
  if (workoutCount >= 4) return "bg-primary";
  if (workoutCount === 3) return "bg-primary/75";
  if (workoutCount === 2) return "bg-primary/55";
  if (workoutCount === 1) return "bg-primary/30";
  return "bg-muted/60";
}

function formatCalendarDate(dateKey: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function CalendarGrid({
  weeks,
  todayKey,
  activityByDate,
}: {
  weeks: number;
  todayKey: string;
  activityByDate: Map<string, DailyWorkoutActivity>;
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

        if (isFuture) {
          return <span key={dateKey} className="aspect-square rounded-[3px]" />;
        }

        return (
          <Popover key={dateKey}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={`${formatCalendarDate(dateKey)}: ${workoutCount} completed workout${workoutCount === 1 ? "" : "s"}`}
                aria-label={`${formatCalendarDate(dateKey)}: ${workoutCount} completed workout${workoutCount === 1 ? "" : "s"}`}
                className={`aspect-square min-w-0 rounded-[3px] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${intensityClass(
                  workoutCount
                )}`}
              />
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3" sideOffset={8}>
              <p className="font-semibold">{formatCalendarDate(dateKey)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {workoutCount} completed workout{workoutCount === 1 ? "" : "s"}
              </p>
              {activity ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {activity.completedSets} completed sets
                  {activity.totalVolumeKg !== null
                    ? ` · ${Math.round(activity.totalVolumeKg).toLocaleString()} kg`
                    : ""}
                </p>
              ) : null}
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
}: {
  activities: DailyWorkoutActivity[];
  todayKey: string;
}) {
  if (activities.length === 0) {
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

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Darker blue means more completed sessions.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Less
          {[0, 1, 2, 3, 4].map((count) => (
            <span
              key={count}
              className={`size-3 rounded-[3px] ${intensityClass(count)}`}
            />
          ))}
          More
        </div>
      </div>

      <div className="md:hidden">
        <CalendarGrid
          weeks={12}
          todayKey={todayKey}
          activityByDate={activityByDate}
        />
      </div>
      <div className="hidden md:block">
        <CalendarGrid
          weeks={26}
          todayKey={todayKey}
          activityByDate={activityByDate}
        />
      </div>
    </div>
  );
}
