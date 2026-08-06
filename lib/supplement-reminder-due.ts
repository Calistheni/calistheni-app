/** Date helpers for user-facing supplement schedules. These deliberately do not
 * use `toISOString()` because a UTC day is not a person's local calendar day. */
export type ReminderPlan = {
  id: string;
  customName: string | null;
  frequency: string;
  weekdays: number[];
  everyNDays?: number | null;
  isActive: boolean;
  archivedAt: string | Date | null;
  createdAt: string | Date;
  supplementDefinition?: { name: string } | null;
  logs: Array<{ scheduledFor: string | Date }>;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function localDateKey(value = new Date(), timeZone?: string) {
  if (!timeZone) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function isValidDateKey(value: string) { return DATE_KEY.test(value); }

/** Weekday for a calendar key: Monday=1 through Sunday=7, independent of UTC offset. */
export function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

function storedDateKey(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

export function isReminderPlanDueOn(plan: ReminderPlan, dateKey: string, timeZone?: string) {
  if (!plan.isActive || !isValidDateKey(dateKey)) return false;
  const startKey = localDateKey(new Date(plan.createdAt), timeZone);
  const archivedKey = plan.archivedAt ? localDateKey(new Date(plan.archivedAt), timeZone) : null;
  if (dateKey < startKey || (archivedKey && dateKey >= archivedKey)) return false;
  if (plan.frequency === "AS_NEEDED") return false;
  if (plan.frequency === "DAILY" || plan.frequency === "TIMES_PER_WEEK") return true;
  if (plan.frequency === "SELECTED_WEEKDAYS") return plan.weekdays.includes(weekdayForDateKey(dateKey));
  if (plan.frequency === "EVERY_N_DAYS") {
    const elapsed = daysBetween(startKey, dateKey);
    return elapsed >= 0 && elapsed % (plan.everyNDays ?? 1) === 0;
  }
  return false;
}

export function dueSupplementPlans(plans: ReminderPlan[], dateKey: string, timeZone?: string) {
  return plans.filter((plan) => isReminderPlanDueOn(plan, dateKey, timeZone));
}

export function incompleteDueSupplementPlans(plans: ReminderPlan[], dateKey: string, timeZone?: string) {
  return dueSupplementPlans(plans, dateKey, timeZone).filter((plan) => !plan.logs.some((log) => storedDateKey(log.scheduledFor) === dateKey));
}

export function supplementReminderBody(plans: ReminderPlan[]) {
  const names = plans.map((plan) => plan.supplementDefinition?.name ?? plan.customName ?? "Supplement");
  if (names.length === 1) return `${names[0]} is still untaken today.`;
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)} are still untaken.`;
  return `You still have ${names.length} supplements to take today.`;
}
