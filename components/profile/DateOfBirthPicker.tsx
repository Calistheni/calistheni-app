"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateOfBirth,
  formatDateOfBirthDisplay,
  getDateOfBirthRange,
  parseDateOfBirth,
} from "@/lib/date-of-birth";
import { cn } from "@/lib/utils";

type DateOfBirthPickerProps = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  error?: string | null;
  ariaDescribedBy?: string;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function getInitialMonth(selected: Date | undefined, latest: Date) {
  if (selected) return selected;

  return new Date(
    Date.UTC(latest.getUTCFullYear() - 18, latest.getUTCMonth(), 1)
  );
}

function clampMonth(month: Date, startMonth: Date, endMonth: Date) {
  if (month.getTime() < startMonth.getTime()) return startMonth;
  if (month.getTime() > endMonth.getTime()) return endMonth;
  return month;
}

export function DateOfBirthPicker({
  id,
  value,
  onChange,
  disabled = false,
  error,
  ariaDescribedBy,
}: DateOfBirthPickerProps) {
  const [open, setOpen] = useState(false);
  const range = useMemo(() => getDateOfBirthRange(), []);
  const selected = value ? parseDateOfBirth(value) ?? undefined : undefined;
  const [month, setMonth] = useState(() =>
    getInitialMonth(selected, range.latest)
  );
  const displayValue = formatDateOfBirthDisplay(value);
  const startMonth = new Date(
    Date.UTC(range.earliest.getUTCFullYear(), range.earliest.getUTCMonth(), 1)
  );
  const endMonth = new Date(
    Date.UTC(range.latest.getUTCFullYear(), range.latest.getUTCMonth(), 1)
  );
  const years = useMemo(() => {
    const items: number[] = [];
    for (
      let year = range.latest.getUTCFullYear();
      year >= range.earliest.getUTCFullYear();
      year -= 1
    ) {
      items.push(year);
    }
    return items;
  }, [range]);

  function updateDisplayedMonth(year: number, monthIndex: number) {
    setMonth(
      clampMonth(new Date(Date.UTC(year, monthIndex, 1)), startMonth, endMonth)
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && selected) setMonth(selected);
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-full justify-start gap-2 px-3 text-left font-normal",
            !displayValue && "text-muted-foreground"
          )}
          disabled={disabled}
          aria-label="Choose date of birth"
          aria-invalid={Boolean(error)}
          aria-describedby={ariaDescribedBy}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
          <span className="truncate">
            {displayValue ?? "Select your date of birth"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions
        collisionPadding={12}
        className="w-auto max-w-none overflow-visible p-0"
        style={
          {
            "--dob-picker-width":
              "min(360px, var(--radix-popover-trigger-width, 360px), var(--radix-popover-content-available-width, calc(100vw - 24px)), calc(100vw - 24px))",
            width: "var(--dob-picker-width)",
            minWidth: "var(--dob-picker-width)",
            maxWidth: "var(--dob-picker-width)",
          } as CSSProperties
        }
        aria-label="Select date of birth"
      >
        <div className="grid grid-cols-2 gap-2 px-3 pt-3 sm:px-4 sm:pt-4">
          <Select
            value={month.getUTCMonth().toString()}
            onValueChange={(nextMonth) =>
              updateDisplayedMonth(month.getUTCFullYear(), Number(nextMonth))
            }
          >
            <SelectTrigger
              className="h-11 w-full px-3 text-base font-medium"
              aria-label="Birth month"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              className="z-[70] max-h-72"
            >
              {MONTH_NAMES.map((name, index) => {
                const candidate = new Date(
                  Date.UTC(month.getUTCFullYear(), index, 1)
                );
                return (
                  <SelectItem
                    key={name}
                    value={index.toString()}
                    className="py-2.5 text-base"
                    disabled={
                      candidate.getTime() < startMonth.getTime() ||
                      candidate.getTime() > endMonth.getTime()
                    }
                  >
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select
            value={month.getUTCFullYear().toString()}
            onValueChange={(nextYear) =>
              updateDisplayedMonth(Number(nextYear), month.getUTCMonth())
            }
          >
            <SelectTrigger
              className="h-11 w-full px-3 text-base font-medium"
              aria-label="Birth year"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="end"
              className="z-[70] max-h-72 min-w-28"
            >
              {years.map((year) => (
                <SelectItem
                  key={year}
                  value={year.toString()}
                  className="py-2.5 text-base"
                >
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Calendar
          mode="single"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDateOfBirth(date));
            setMonth(date);
            setOpen(false);
          }}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={[{ before: range.earliest }, { after: range.latest }]}
          timeZone="UTC"
          fixedWeeks
          hideNavigation
          autoFocus
          className="mx-auto w-full px-2 pb-3 pt-2 sm:pb-4 sm:pt-3"
          style={
            {
              "--cell-size":
                "min(44px, calc((var(--dob-picker-width) - 18px) / 7))",
            } as CSSProperties
          }
          classNames={{
            month_caption: "sr-only",
          }}
        />
        {selected ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center text-muted-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
