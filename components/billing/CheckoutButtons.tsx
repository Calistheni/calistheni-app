"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProPlan = "PRO_MONTHLY" | "PRO_YEARLY" | "PRO_LIFETIME";

export function CheckoutButtons() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<ProPlan | null>(null);

  async function startCheckout(plan: ProPlan) {
    if (loadingPlan) return;
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
        error instanceof Error ? error.message : "Checkout is unavailable right now."
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Button
        size="lg"
        disabled={loadingPlan !== null}
        onClick={() => void startCheckout("PRO_MONTHLY")}
      >
        {loadingPlan === "PRO_MONTHLY" ? "Opening Checkout..." : "Continue Monthly"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        disabled={loadingPlan !== null}
        onClick={() => void startCheckout("PRO_YEARLY")}
      >
        {loadingPlan === "PRO_YEARLY" ? "Opening Checkout..." : "Continue Yearly"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        disabled={loadingPlan !== null}
        onClick={() => void startCheckout("PRO_LIFETIME")}
      >
        {loadingPlan === "PRO_LIFETIME"
          ? "Opening Checkout..."
          : "Choose Lifetime"}
      </Button>
    </div>
  );
}
