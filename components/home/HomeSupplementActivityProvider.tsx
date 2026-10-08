"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  executeHomeSupplementTake,
  hasHomeSupplementCompletion,
  removeHomeSupplementCompletion,
  upsertHomeSupplementCompletion,
  type HomeSupplementActivityState,
} from "@/lib/home-supplement-activity";
import type { DailySupplementCalendarState } from "@/lib/supplement-calendar";
import type { HomeSupplementQuickActionPlan } from "@/lib/supplement-quick-actions";
import { subscribeToSupplementActivityChanges } from "@/lib/supplement-activity-events";

type HomeSupplementActivityContextValue = HomeSupplementActivityState & {
  pendingPlanIds: ReadonlySet<string>;
  take: (planId: string, scheduledDate: string, name: string) => Promise<void>;
};

const HomeSupplementActivityContext = createContext<HomeSupplementActivityContextValue | null>(null);

function reconcileRemindersAfterTake() {
  void import("@/lib/native/supplement-reminders")
    .then(({ reconcileSupplementReminders }) => reconcileSupplementReminders())
    .catch(() => undefined);
}

export function HomeSupplementActivityProvider({
  initialPlans,
  initialSupplementStates,
  children,
}: {
  initialPlans: HomeSupplementQuickActionPlan[];
  initialSupplementStates: DailySupplementCalendarState[];
  children: ReactNode;
}) {
  const [state, setState] = useState<HomeSupplementActivityState>(() => ({
    plans: initialPlans,
    supplementStates: initialSupplementStates,
  }));
  const stateRef = useRef(state);
  const inFlightPlanIds = useRef(new Set<string>());
  const [pendingPlanIds, setPendingPlanIds] = useState<ReadonlySet<string>>(() => new Set());

  const updateState = useCallback(
    (update: (current: HomeSupplementActivityState) => HomeSupplementActivityState) => {
      setState((current) => {
        const next = update(current);
        stateRef.current = next;
        return next;
      });
    },
    []
  );

  useEffect(
    () =>
      subscribeToSupplementActivityChanges((change) => {
        updateState((current) =>
          change.type === "completed"
            ? upsertHomeSupplementCompletion(current, change.completion)
            : removeHomeSupplementCompletion(
                current,
                change.planId,
                change.scheduledDate
              )
        );
      }),
    [updateState]
  );

  const take = useCallback(async (planId: string, scheduledDate: string, name: string) => {
    if (
      inFlightPlanIds.current.has(planId) ||
      hasHomeSupplementCompletion(stateRef.current, planId, scheduledDate)
    ) return;

    const plan = stateRef.current.plans.find((item) => item.id === planId);
    if (!plan) return;
    inFlightPlanIds.current.add(planId);
    setPendingPlanIds(new Set(inFlightPlanIds.current));

    try {
      const result = await executeHomeSupplementTake({
        plan,
        scheduledDate,
        name,
        update: updateState,
      });
      if (result.ok) {
        reconcileRemindersAfterTake();
      } else {
        toast.error(result.error);
      }
    } finally {
      inFlightPlanIds.current.delete(planId);
      setPendingPlanIds(new Set(inFlightPlanIds.current));
    }
  }, [updateState]);

  const value = useMemo(() => ({ ...state, pendingPlanIds, take }), [pendingPlanIds, state, take]);
  return <HomeSupplementActivityContext value={value}>{children}</HomeSupplementActivityContext>;
}

export function useHomeSupplementActivity() {
  const context = useContext(HomeSupplementActivityContext);
  if (!context) throw new Error("useHomeSupplementActivity must be used inside HomeSupplementActivityProvider.");
  return context;
}
