import { isPlanScheduledOn } from "./progress.ts";

const DAY_MS = 86_400_000;

export type DailySupplementCalendarState = {
  date: string;
  scheduled: number;
  completed: number;
  status: "none" | "missed" | "partial" | "complete";
  completedSupplements: Array<{
    name: string;
    dosage: string | null;
    unit: string | null;
    completedAt: string | null;
  }>;
};

export type SupplementCalendarPlan = {
  frequency: string;
  weekdays: number[];
  everyNDays: number | null;
  createdAt: Date;
  archivedAt: Date | null;
  logs: Array<{
    scheduledFor: Date;
    completedAt?: Date;
    dosage?: string | null;
    unit?: string | null;
    name?: string | null;
  }>;
};

export function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function toSupplementCalendarDateKey(value: Date) {
  return utcDay(value).toISOString().slice(0, 10);
}

/** Uses the same UTC day boundary as supplement schedules and stored scheduledFor values. */
export function isSupplementPlanActiveOn(plan: Omit<SupplementCalendarPlan, "logs">, day: Date) {
  return day >= utcDay(plan.createdAt)
    && (!plan.archivedAt || day < utcDay(plan.archivedAt))
}

export function isSupplementExpectedOn(plan: Omit<SupplementCalendarPlan, "logs">, day: Date) {
  return isSupplementPlanActiveOn(plan, day) && isPlanScheduledOn(plan, day);
}

export function buildDailySupplementCalendarStates(
  plans: SupplementCalendarPlan[],
  start: Date,
  end: Date
) {
  const states: DailySupplementCalendarState[] = [];
  for (let day = utcDay(start); day < end; day = new Date(day.getTime() + DAY_MS)) {
    let scheduled = 0;
    let completed = 0;
    const completedSupplements: DailySupplementCalendarState["completedSupplements"] = [];
    for (const plan of plans) {
      if (!isSupplementPlanActiveOn(plan, day)) continue;
      const completion = plan.logs.find(
        (log) => toSupplementCalendarDateKey(log.scheduledFor) === toSupplementCalendarDateKey(day)
      );
      const expected = isSupplementExpectedOn(plan, day);

      if (expected) scheduled += 1;
      // As-needed doses are activity only after a real completion; they never
      // create a scheduled/missed expectation on otherwise empty dates.
      if ((expected || plan.frequency === "AS_NEEDED") && completion) {
        completed += 1;
        completedSupplements.push({
          name: completion.name ?? "Supplement",
          dosage: completion.dosage ?? null,
          unit: completion.unit ?? null,
          completedAt: completion.completedAt?.toISOString() ?? null,
        });
      }
    }
    states.push({
      date: toSupplementCalendarDateKey(day),
      scheduled,
      completed,
      status: scheduled === 0 ? (completed > 0 ? "complete" : "none") : completed === 0 ? "missed" : completed === scheduled ? "complete" : "partial",
      completedSupplements,
    });
  }
  return states;
}
