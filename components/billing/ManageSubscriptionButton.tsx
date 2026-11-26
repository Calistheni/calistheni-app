"use client";

import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native/platform";

export function ManageSubscriptionButton({
  variant = "default",
  label = "Manage Subscription",
  onError,
}: {
  variant?: "default" | "outline" | "secondary";
  label?: string;
  onError?: (message: string | null) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function openPortal() {
    if (isLoading) return;
    setIsLoading(true);
    onError?.(null);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Billing management is unavailable right now.");
      }
      if (isNativeApp()) {
        await Browser.open({ url: payload.url });
      } else {
        window.location.assign(payload.url);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing management is unavailable right now.";
      if (onError) onError(message);
      else toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant={variant} disabled={isLoading} onClick={() => void openPortal()}>
      {isLoading ? "Opening Billing..." : label}
    </Button>
  );
}
