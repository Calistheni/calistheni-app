"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { enGB } from "react-day-picker/locale";
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

type NutritionDateNavigatorProps = {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
};

export function NutritionDateNavigator({
  selectedDate,
  onSelectDate,
}: NutritionDateNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    nutritionDateFromKey(selectedDate)
  );
  const today = localNutritionDateKey();
  const week = nutritionWeekDateKeys(selectedDate);

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
            onClick={() => onSelectDate(today)}
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
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-1">
              <Calendar
                mode="single"
                locale={enGB}
                selected={nutritionDateFromKey(selectedDate)}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                onSelect={(nextDate) => {
                  if (!nextDate) return;
                  onSelectDate(localNutritionDateKey(nextDate));
                  setCalendarMonth(nextDate);
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
          onClick={() => onSelectDate(addNutritionDays(selectedDate, -7))}
        >
          <ChevronLeft />
        </Button>
        <div className="grid min-w-0 grid-cols-7 gap-0.5" role="list" aria-label="Week dates">
          {week.map((dateKey) => {
            const date = nutritionDateFromKey(dateKey);
            const selected = dateKey === selectedDate;
            const isToday = dateKey === today;
            const weekday = formatNutritionWeekday(dateKey);

            return (
              <Button
                key={dateKey}
                type="button"
                variant={selected ? "default" : "ghost"}
                aria-label={formatNutritionDateAriaLabel(dateKey)}
                aria-current={selected ? "date" : undefined}
                aria-pressed={selected}
                onClick={() => onSelectDate(dateKey)}
                className={cn(
                  "relative h-12 min-w-0 flex-col gap-0 rounded-md px-0 text-[10px] leading-tight sm:text-xs",
                  !selected && "text-muted-foreground hover:text-foreground",
                  isToday && !selected && "ring-1 ring-primary/50"
                )}
              >
                <span className="max-w-full truncate">{weekday}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {date.getDate()}
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
          onClick={() => onSelectDate(addNutritionDays(selectedDate, 7))}
        >
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
