"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButton({
  variant = "default",
}: {
  variant?: "default" | "outline" | "secondary";
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function openPortal() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Billing management is unavailable right now.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Billing management is unavailable right now."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant={variant} disabled={isLoading} onClick={() => void openPortal()}>
      {isLoading ? "Opening Billing..." : "Manage Subscription"}
    </Button>
  );
}
