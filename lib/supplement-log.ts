import { isSupplementExpectedOn, isSupplementPlanActiveOn } from "./supplement-calendar.ts";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLocalSupplementDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseSupplementDateKey(value: unknown) {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

type SupplementLoggablePlan = {
  frequency: string;
  weekdays: number[];
  everyNDays: number | null;
  createdAt: Date;
  archivedAt: Date | null;
  isActive: boolean;
};

export function getSupplementLogEligibility(plan: SupplementLoggablePlan, scheduledFor: Date) {
  if (!plan.isActive || !isSupplementPlanActiveOn(plan, scheduledFor)) {
    return { eligible: false as const, error: "This supplement plan is not active on this date." };
  }
  if (plan.frequency === "AS_NEEDED" || isSupplementExpectedOn(plan, scheduledFor)) {
    return { eligible: true as const };
  }
  return { eligible: false as const, error: "This supplement is not scheduled for this date." };
}
