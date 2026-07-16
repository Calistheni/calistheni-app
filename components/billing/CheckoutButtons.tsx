"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Crown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ProPlan = "PRO_MONTHLY" | "PRO_YEARLY" | "PRO_LIFETIME";

const plans: Array<{
  id: ProPlan;
  name: string;
  price: string;
  cadence: string;
  note: string;
  features: string[];
  icon: typeof Crown;
}> = [
  {
    id: "PRO_MONTHLY",
    name: "Monthly Pro",
    price: "€4.99",
    cadence: "/ month",
    note: "Flexible recurring access.",
    features: ["Unlimited routines", "Unlimited custom exercises"],
    icon: Crown,
  },
  {
    id: "PRO_YEARLY",
    name: "Yearly Pro",
    price: "€39.99",
    cadence: "/ year",
    note: "Save €19.89 per year (about 33%) compared with monthly.",
    features: ["Everything in Pro", "One annual payment"],
    icon: Sparkles,
  },
  {
    id: "PRO_LIFETIME",
    name: "Founding Lifetime Pro",
    price: "€79.99",
    cadence: "once",
    note: "Paid once — no renewal.",
    features: ["Lifetime Pro access", "No recurring subscription"],
    icon: Crown,
  },
];

export function CheckoutButtons({
  isPro = false,
  currentPlan = null,
  hasRecurringSubscription = false,
}: {
  isPro?: boolean;
  currentPlan?: ProPlan | null;
  hasRecurringSubscription?: boolean;
}) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<ProPlan | null>(null);

  async function startCheckout(plan: ProPlan) {
    if (loadingPlan || isPro) return;
    setLoadingPlan(plan);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as {
        code?: string;
        error?: string;
        url?: string;
      };

      if (response.status === 401) {
        toast.error("Sign in before choosing a Pro plan.", {
          action: { label: "Sign in", onClick: () => router.push("/login") },
        });
        return;
      }
      if (payload.code === "ALREADY_PRO") {
        toast.info("You already have Pro access.");
        router.refresh();
        return;
      }
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Checkout is unavailable right now.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Checkout is unavailable right now."
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => {
        const Icon = plan.icon;
        const isCurrent = isPro && currentPlan === plan.id;
        const isRecommended = !isPro && plan.id === "PRO_YEARLY";
        const lifetimeBlocked =
          isPro && plan.id === "PRO_LIFETIME" && hasRecurringSubscription;
        const disabled = isPro || loadingPlan !== null;
        const buttonLabel = isCurrent
          ? "Current plan"
          : lifetimeBlocked
            ? "Available after recurring plan ends"
            : isPro
              ? "Included with your Pro access"
              : loadingPlan === plan.id
                ? "Opening Checkout..."
                : plan.id === "PRO_MONTHLY"
                  ? "Choose Monthly"
                  : plan.id === "PRO_YEARLY"
                    ? "Choose Yearly"
                    : "Choose Lifetime";

        return (
          <article
            key={plan.id}
            className={`relative flex min-w-0 flex-col rounded-3xl border bg-card/75 p-6 shadow-none sm:p-7 ${
              isRecommended
                ? "border-primary/50 bg-primary/5 lg:-translate-y-3"
                : isCurrent
                  ? "border-primary/40"
                  : "border-border/80"
            }`}
          >
            <div className="flex min-h-7 items-center justify-between gap-3">
              {isRecommended ? <Badge>Best value</Badge> : <span />}
              {isCurrent ? <Badge variant="secondary">Current plan</Badge> : null}
            </div>
            <span className="mt-6 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">{plan.name}</h2>
            <div className="mt-4 flex flex-wrap items-end gap-x-2 gap-y-1">
              <p className="text-4xl font-bold tracking-tight">{plan.price}</p>
              <p className="pb-1 text-sm text-muted-foreground">{plan.cadence}</p>
            </div>
            <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
              {plan.note}
            </p>
            <ul className="mt-6 space-y-3 border-t pt-5 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              variant={isRecommended ? "default" : "outline"}
              className="mt-8 min-h-11 w-full whitespace-normal"
              disabled={disabled}
              onClick={() => void startCheckout(plan.id)}
            >
              {buttonLabel}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
