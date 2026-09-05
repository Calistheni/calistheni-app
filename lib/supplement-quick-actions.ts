import {
  isReminderPlanDueOn,
  type ReminderPlan,
} from "@/lib/supplement-reminder-due";

export type HomeSupplementQuickActionPlan = ReminderPlan & {
  dosage: string | null;
  unit: string | null;
  preferredTime: string | null;
};

export type HomeSupplementQuickAction = HomeSupplementQuickActionPlan & {
  name: string;
  taken: boolean;
};

function storedDateKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getHomeSupplementQuickActions(
  plans: HomeSupplementQuickActionPlan[],
  dateKey: string,
  timeZone?: string
) {
  return plans
    .filter((plan) => isReminderPlanDueOn(plan, dateKey, timeZone))
    .map<HomeSupplementQuickAction>((plan) => ({
      ...plan,
      name:
        plan.supplementDefinition?.name ?? plan.customName ?? "Supplement",
      taken: plan.logs.some(
        (log) => storedDateKey(log.scheduledFor) === dateKey
      ),
    }))
    .sort((left, right) => {
      if (left.taken !== right.taken) return left.taken ? 1 : -1;
      return (left.preferredTime ?? "").localeCompare(
        right.preferredTime ?? ""
      ) || left.name.localeCompare(right.name);
    });
}

/** Never hide a due action; only trim already-completed rows on a busy Home. */
export function getVisibleHomeSupplementQuickActions(
  actions: HomeSupplementQuickAction[],
  completedRowLimit = 5
) {
  const pending = actions.filter((action) => !action.taken);
  const completed = actions.filter((action) => action.taken);
  const remainingSlots = Math.max(0, completedRowLimit - pending.length);
  return [...pending, ...completed.slice(0, remainingSlots)];
}
