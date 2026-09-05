export type WorkoutDateTimeFormat = "date" | "dateTime";

const ABSOLUTE_ISO_TIMESTAMP = /(?:z|[+-]\d{2}:\d{2})$/i;

export function formatWorkoutDateTime(
  isoTimestamp: string,
  {
    format = "dateTime",
    locale,
    timeZone,
  }: {
    format?: WorkoutDateTimeFormat;
    locale?: string;
    timeZone?: string;
  } = {}
) {
  if (!ABSOLUTE_ISO_TIMESTAMP.test(isoTimestamp)) return "Invalid date";
  const value = new Date(isoTimestamp);
  if (!Number.isFinite(value.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(format === "dateTime" ? { timeStyle: "medium" as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
}

export function formatWorkoutRelativeTime(
  isoTimestamp: string,
  nowMs = Date.now()
) {
  const value = new Date(isoTimestamp);
  if (!Number.isFinite(value.getTime())) return "Invalid date";
  const seconds = Math.max(0, Math.floor((nowMs - value.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return formatWorkoutDateTime(isoTimestamp, { format: "date" });
}
