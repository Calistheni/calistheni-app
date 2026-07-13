"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type SyncState = "syncing" | "active" | "delayed";

export function ProSuccessStatus({ initialIsPro }: { initialIsPro: boolean }) {
  const [state, setState] = useState<SyncState>(initialIsPro ? "active" : "syncing");

  useEffect(() => {
    if (initialIsPro) return;

    let canceled = false;
    let attempt = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function checkStatus() {
      attempt += 1;
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        const payload = (await response.json()) as { isPro?: boolean };
        if (!canceled && response.ok && payload.isPro) {
          setState("active");
          return;
        }
      } catch {
        // A transient status request failure is retried within the bounded window.
      }

      if (canceled) return;
      if (attempt >= 8) {
        setState("delayed");
        return;
      }
      timeout = setTimeout(() => void checkStatus(), 1500);
    }

    void checkStatus();
    return () => {
      canceled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [initialIsPro]);

  return (
    <Card>
      <CardHeader>
        <h1 className="text-3xl font-bold">
          {state === "active"
            ? "Welcome to Calistheni Pro"
            : "Payment received. Activating Calistheni Pro..."}
        </h1>
      </CardHeader>
      <CardContent className="space-y-5">
        {state === "syncing" ? (
          <p className="text-sm text-muted-foreground">
            We&apos;re waiting for Stripe&apos;s verified webhook to update your account.
          </p>
        ) : null}
        {state === "active" ? (
          <p className="text-sm text-muted-foreground">
            Your Pro entitlements are active.
          </p>
        ) : null}
        {state === "delayed" ? (
          <p className="text-sm text-muted-foreground">
            Your payment was received, but Pro activation is still syncing. Please
            refresh in a moment.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/home">Go to Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/profile">View Profile</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
