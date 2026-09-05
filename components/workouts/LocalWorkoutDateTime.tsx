"use client";

import { useSyncExternalStore } from "react";
import {
  formatWorkoutDateTime,
  formatWorkoutRelativeTime,
  type WorkoutDateTimeFormat,
} from "@/lib/workout-date-time";

const subscribe = () => () => undefined;

export function LocalWorkoutDateTime({
  value,
  format = "dateTime",
  className,
}: {
  value: string;
  format?: WorkoutDateTimeFormat;
  className?: string;
}) {
  const canUseBrowserLocale = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  return (
    <time dateTime={value} className={className}>
      {canUseBrowserLocale ? formatWorkoutDateTime(value, { format }) : ""}
    </time>
  );
}

export function LocalWorkoutRelativeTime({ value }: { value: string }) {
  const canUseBrowserLocale = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  return (
    <time dateTime={value}>
      {canUseBrowserLocale ? formatWorkoutRelativeTime(value) : ""}
    </time>
  );
}
