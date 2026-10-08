import type { DailySupplementCalendarState } from "@/lib/supplement-calendar";
import type { HomeSupplementQuickActionPlan } from "@/lib/supplement-quick-actions";
import {
  createSupplementLogRequest,
  readSupplementLogMutationResponse,
  readSupplementRequestError,
} from "@/lib/supplement-log-client";
import { notifySupplementActivityChange } from "@/lib/supplement-activity-events";

export type HomeSupplementActivityState = {
  plans: HomeSupplementQuickActionPlan[];
  supplementStates: DailySupplementCalendarState[];
};

export type HomeSupplementCompletion = {
  id: string;
  planId: string;
  scheduledFor: string;
  completedAt: string;
  dosage: string | null;
  unit: string | null;
  name: string;
};

export type OptimisticHomeSupplementCompletion = Omit<HomeSupplementCompletion, "id"> & {
  id: null;
};

function dateKey(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function calendarStatus(scheduled: number, completed: number): DailySupplementCalendarState["status"] {
  if (scheduled === 0) return completed > 0 ? "complete" : "none";
  if (completed === 0) return "missed";
  return completed >= scheduled ? "complete" : "partial";
}

/** Adds or replaces one logical plan/day completion without touching other activity. */
export function upsertHomeSupplementCompletion(
  state: HomeSupplementActivityState,
  completion: HomeSupplementCompletion | OptimisticHomeSupplementCompletion
): HomeSupplementActivityState {
  const completionDate = dateKey(completion.scheduledFor);
  return {
    plans: state.plans.map((plan) => {
      if (plan.id !== completion.planId) return plan;
      const logs = plan.logs.filter((log) => dateKey(log.scheduledFor) !== completionDate);
      return { ...plan, logs: [...logs, { scheduledFor: completion.scheduledFor }] };
    }),
    supplementStates: state.supplementStates.map((calendarState) => {
      if (calendarState.date !== completionDate) return calendarState;
      const nextCompletion = {
        planId: completion.planId,
        name: completion.name,
        dosage: completion.dosage,
        unit: completion.unit,
        completedAt: completion.completedAt,
      };
      const index = calendarState.completedSupplements.findIndex(
        (item) => item.planId === completion.planId
      );
      const completedSupplements = [...calendarState.completedSupplements];
      if (index === -1) completedSupplements.push(nextCompletion);
      else completedSupplements[index] = nextCompletion;
      const completed = completedSupplements.length;
      return {
        ...calendarState,
        completed,
        status: calendarStatus(calendarState.scheduled, completed),
        completedSupplements,
      };
    }),
  };
}

/** Rolls back only the optimistic plan/day entry created by this mutation. */
export function removeHomeSupplementCompletion(
  state: HomeSupplementActivityState,
  planId: string,
  scheduledDate: string
): HomeSupplementActivityState {
  return {
    plans: state.plans.map((plan) =>
      plan.id === planId
        ? { ...plan, logs: plan.logs.filter((log) => dateKey(log.scheduledFor) !== scheduledDate) }
        : plan
    ),
    supplementStates: state.supplementStates.map((calendarState) => {
      if (calendarState.date !== scheduledDate) return calendarState;
      const completedSupplements = calendarState.completedSupplements.filter(
        (item) => item.planId !== planId
      );
      const completed = completedSupplements.length;
      return {
        ...calendarState,
        completed,
        status: calendarStatus(calendarState.scheduled, completed),
        completedSupplements,
      };
    }),
  };
}

export function hasHomeSupplementCompletion(
  state: HomeSupplementActivityState,
  planId: string,
  scheduledDate: string
) {
  return state.plans.some(
    (plan) => plan.id === planId && plan.logs.some((log) => dateKey(log.scheduledFor) === scheduledDate)
  );
}

/** The exact optimistic request/reconcile/rollback transaction used by Home. */
export async function executeHomeSupplementTake({
  plan,
  scheduledDate,
  name,
  update,
  request = createSupplementLogRequest,
  now = () => new Date(),
}: {
  plan: HomeSupplementQuickActionPlan;
  scheduledDate: string;
  name: string;
  update: (
    updater: (current: HomeSupplementActivityState) => HomeSupplementActivityState
  ) => void;
  request?: typeof createSupplementLogRequest;
  now?: () => Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const optimistic: OptimisticHomeSupplementCompletion = {
    id: null,
    planId: plan.id,
    scheduledFor: `${scheduledDate}T00:00:00.000Z`,
    completedAt: now().toISOString(),
    dosage: plan.dosage,
    unit: plan.unit,
    name,
  };
  update((current) => upsertHomeSupplementCompletion(current, optimistic));

  try {
    const response = await request(plan.id, scheduledDate);
    if (!response.ok) {
      throw new Error(
        await readSupplementRequestError(
          response,
          `Unable to mark ${name} as taken.`
        )
      );
    }
    const result = await readSupplementLogMutationResponse(response);
    if (!result || result.log.planId !== plan.id) {
      throw new Error(`Unable to confirm ${name} as taken.`);
    }
    update((current) => upsertHomeSupplementCompletion(current, result.log));
    notifySupplementActivityChange({ type: "completed", completion: result.log });
    return { ok: true };
  } catch (error) {
    update((current) => removeHomeSupplementCompletion(current, plan.id, scheduledDate));
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Unable to mark ${name} as taken.`,
    };
  }
}
