"use client";

import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createSupplementLogRequest,
  readSupplementRequestError,
} from "@/lib/supplement-log-client";
import { getLocalSupplementDateKey } from "@/lib/supplement-log";
import {
  getHomeSupplementQuickActions,
  getVisibleHomeSupplementQuickActions,
  type HomeSupplementQuickActionPlan,
} from "@/lib/supplement-quick-actions";

type HomeSupplementQuickActionsProps = {
  initialPlans: HomeSupplementQuickActionPlan[];
};

function formatPreferredTime(value: string | null) {
  return value?.replaceAll("_", " ").toLowerCase() ?? "Any time";
}

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function reconcileRemindersAfterTake() {
  void import("@/lib/native/supplement-reminders").then(
    ({ reconcileSupplementReminders }) => reconcileSupplementReminders()
  ).catch(() => undefined);
}

export function HomeSupplementQuickActions({
  initialPlans,
}: HomeSupplementQuickActionsProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [takingPlanId, setTakingPlanId] = useState<string | null>(null);
  const today = getLocalSupplementDateKey();
  const actions = useMemo(
    () => getHomeSupplementQuickActions(plans, today, deviceTimeZone()),
    [plans, today]
  );
  const visibleActions = getVisibleHomeSupplementQuickActions(actions);

  if (!actions.length) return null;

  async function take(planId: string, name: string) {
    if (takingPlanId) return;
    setTakingPlanId(planId);

    try {
      const response = await createSupplementLogRequest(planId, today);
      if (!response.ok) {
        throw new Error(
          await readSupplementRequestError(
            response,
            `Unable to mark ${name} as taken.`
          )
        );
      }

      setPlans((current) =>
        current.map((plan) =>
          plan.id === planId &&
          !plan.logs.some(
            (log) => String(log.scheduledFor).slice(0, 10) === today
          )
            ? {
                ...plan,
                logs: [
                  ...plan.logs,
                  { scheduledFor: `${today}T00:00:00.000Z` },
                ],
              }
            : plan
        )
      );
      reconcileRemindersAfterTake();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Unable to mark ${name} as taken.`
      );
    } finally {
      setTakingPlanId(null);
    }
  }

  return (
    <Card className="mt-4 max-w-2xl border-border/80 bg-card/80 py-0 shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Supplements</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/profile/supplements">View all</Link>
          </Button>
        </div>
        <div className="mt-2 divide-y divide-border/70">
          {visibleActions.map((action) => {
            const pending = takingPlanId === action.id;
            return (
              <div
                key={action.id}
                className="flex min-w-0 items-center gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{action.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[action.dosage, action.unit].filter(Boolean).join(" ") ||
                      "Scheduled"}
                    {` · ${formatPreferredTime(action.preferredTime)}`}
                  </p>
                </div>
                {action.taken ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled
                    aria-label={`${action.name} taken`}
                  >
                    <Check aria-hidden="true" /> Taken
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={takingPlanId !== null}
                    aria-label={`Take ${action.name}`}
                    onClick={() => take(action.id, action.name)}
                  >
                    {pending ? (
                      <LoaderCircle
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    {pending ? "Taking…" : "Take"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {visibleActions.length < actions.length ? (
          <p className="pt-2 text-xs text-muted-foreground">
            {actions.length - visibleActions.length} more completed today
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
