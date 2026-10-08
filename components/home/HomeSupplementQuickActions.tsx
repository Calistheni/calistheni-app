"use client";

import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { useHomeSupplementActivity } from "@/components/home/HomeSupplementActivityProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLocalSupplementDateKey } from "@/lib/supplement-log";
import {
  getHomeSupplementQuickActions,
  getVisibleHomeSupplementQuickActions,
} from "@/lib/supplement-quick-actions";

function formatPreferredTime(value: string | null) {
  return value?.replaceAll("_", " ").toLowerCase() ?? "Any time";
}

function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function HomeSupplementQuickActions() {
  const { plans, pendingPlanIds, take } = useHomeSupplementActivity();
  const today = getLocalSupplementDateKey();
  const actions = useMemo(
    () => getHomeSupplementQuickActions(plans, today, deviceTimeZone()),
    [plans, today]
  );
  const visibleActions = getVisibleHomeSupplementQuickActions(actions);

  if (!actions.length) return null;

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
            const pending = pendingPlanIds.has(action.id);
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
                    disabled={pending}
                    aria-label={`Take ${action.name}`}
                    onClick={() => void take(action.id, today, action.name)}
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
