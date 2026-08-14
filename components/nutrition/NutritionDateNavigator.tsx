"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { enGB } from "react-day-picker/locale";
import type { DayButton as DayPickerDayButton } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addNutritionDays,
  formatNutritionDateAriaLabel,
  formatNutritionMonthLabel,
  formatNutritionWeekday,
  localNutritionDateKey,
  nutritionDateFromKey,
  nutritionWeekDateKeys,
} from "@/lib/nutrition/date-navigation";
import { cn } from "@/lib/utils";

type DayProgress = {
  totals: {
    caloriesKcal: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
  };
  goal: {
    caloriesKcal: number;
    proteinGrams: number;
    carbohydrateGrams: number;
    fatGrams: number;
  };
  overallDisplayProgress: number;
  complete: boolean;
};

type NutritionDateNavigatorProps = {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  refreshToken: number;
};

type CalendarDayButtonProps = ComponentProps<typeof DayPickerDayButton>;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function nutritionProgressAriaLabel(dateKey: string, progress?: DayProgress) {
  const base = formatNutritionDateAriaLabel(dateKey);
  if (!progress) return base;
  const percent = Math.round(progress.overallDisplayProgress * 100);
  const { totals, goal } = progress;
  return `${base}. Nutrition progress ${percent}%. ${totals.caloriesKcal} of ${
    goal.caloriesKcal
  } calories, ${totals.proteinGrams} of ${goal.proteinGrams} grams protein, ${
    totals.carbohydrateGrams
  } of ${goal.carbohydrateGrams} grams carbohydrates, ${totals.fatGrams} of ${
    goal.fatGrams
  } grams fat.${progress.complete ? " Nutrition goal complete." : ""}`;
}

/** Compact calendar equivalent of the CardioGoalCard radial progress language. */
function NutritionProgressRing({
  progress,
  selected,
}: {
  progress: DayProgress;
  selected?: boolean;
}) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const filled =
    circumference * Math.min(1, Math.max(0, progress.overallDisplayProgress));
  return (
    <svg
      className={cn(
        "pointer-events-none absolute -inset-1 size-9 -rotate-90",
        selected ? "text-primary-foreground" : "text-primary"
      )}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2.25"
      />
      <circle
        cx="16"
        cy="16"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
      />
    </svg>
  );
}

export function NutritionDateNavigator({
  selectedDate,
  onSelectDate,
  refreshToken,
}: NutritionDateNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    nutritionDateFromKey(selectedDate)
  );
  const [progress, setProgress] = useState<Record<string, DayProgress>>({});
  const today = localNutritionDateKey();
  const week = nutritionWeekDateKeys(selectedDate);
  const visibleMonth = monthKey(calendarMonth);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/user/nutrition/calendar?month=${visibleMonth}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load nutrition calendar.");
        return response.json();
      })
      .then((data) => {
        if (!cancelled)
          setProgress((data.days ?? {}) as Record<string, DayProgress>);
      })
      .catch(() => {
        if (!cancelled) setProgress({});
      });
    return () => {
      cancelled = true;
    };
  }, [visibleMonth, refreshToken]);

  function selectDate(dateKey: string) {
    setCalendarMonth(nutritionDateFromKey(dateKey));
    onSelectDate(dateKey);
  }

  const calendarComponents = useMemo(
    () => ({
      DayButton: ({
        day,
        modifiers,
        className,
        ...props
      }: CalendarDayButtonProps) => {
        const dateKey = localNutritionDateKey(day.date);
        const dayProgress = dateKey <= today ? progress[dateKey] : undefined;
        return (
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={nutritionProgressAriaLabel(dateKey, dayProgress)}
            className={cn(
              "relative isolate mx-auto flex size-(--cell-size) min-w-(--cell-size) border-0 text-base leading-none font-medium",
              modifiers.selected &&
                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
              modifiers.today &&
                !modifiers.selected &&
                "ring-1 ring-primary/50",
              className
            )}
          >
            <span className="relative z-10 flex size-7 items-center justify-center">
              {dayProgress ? (
                <NutritionProgressRing
                  progress={dayProgress}
                  selected={modifiers.selected}
                />
              ) : null}
              <span>{day.date.getDate()}</span>
            </span>
          </Button>
        );
      },
    }),
    [progress, today]
  );

  return (
    <section aria-label="Nutrition date navigation" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
          {formatNutritionMonthLabel(selectedDate)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Go to today"
            onClick={() => selectDate(today)}
          >
            Today
          </Button>
          <Popover
            open={calendarOpen}
            onOpenChange={(open) => {
              if (open) setCalendarMonth(nutritionDateFromKey(selectedDate));
              setCalendarOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Open calendar"
              >
                <CalendarDays />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(22rem,calc(100vw-1rem))] p-1"
            >
              <Calendar
                mode="single"
                locale={enGB}
                selected={nutritionDateFromKey(selectedDate)}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                components={calendarComponents}
                onSelect={(nextDate) => {
                  if (!nextDate) return;
                  selectDate(localNutritionDateKey(nextDate));
                  setCalendarOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Previous week"
          onClick={() => selectDate(addNutritionDays(selectedDate, -7))}
        >
          <ChevronLeft />
        </Button>
        <div
          className="grid min-w-0 grid-cols-7 gap-0.5"
          role="list"
          aria-label="Week dates"
        >
          {week.map((dateKey) => {
            const date = nutritionDateFromKey(dateKey);
            const selected = dateKey === selectedDate;
            const isToday = dateKey === today;
            const dayProgress =
              dateKey <= today ? progress[dateKey] : undefined;
            return (
              <Button
                key={dateKey}
                type="button"
                variant={selected ? "default" : "ghost"}
                aria-label={nutritionProgressAriaLabel(dateKey, dayProgress)}
                aria-current={selected ? "date" : undefined}
                aria-pressed={selected}
                onClick={() => selectDate(dateKey)}
                className={cn(
                  "relative h-14 min-w-0 flex-col gap-0.5 rounded-md px-0 text-[10px] leading-tight sm:text-xs",
                  !selected && "text-muted-foreground hover:text-foreground",
                  isToday && !selected && "ring-1 ring-primary/50"
                )}
              >
                <span className="relative z-10 max-w-full truncate">
                  {formatNutritionWeekday(dateKey)}
                </span>
                <span className="relative z-10 flex size-7 items-center justify-center text-sm font-semibold tabular-nums">
                  {dayProgress ? (
                    <NutritionProgressRing
                      progress={dayProgress}
                      selected={selected}
                    />
                  ) : null}
                  <span>{date.getDate()}</span>
                </span>
                {isToday && !selected ? (
                  <span className="sr-only">Today</span>
                ) : null}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Next week"
          onClick={() => selectDate(addNutritionDays(selectedDate, 7))}
        >
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
