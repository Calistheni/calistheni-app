"use client";

import { useSyncExternalStore } from "react";
import { ApplePurchaseOptions } from "@/components/billing/ApplePurchaseOptions";
import { CheckoutButtons } from "@/components/billing/CheckoutButtons";
import { Skeleton } from "@/components/ui/skeleton";
import { selectProPurchaseSurface, type ProPurchaseSurface } from "@/lib/billing-provider";
import { getAppleStoreKitAvailability } from "@/lib/native/apple-storekit";

type ProPlan = "PRO_MONTHLY" | "PRO_YEARLY" | "PRO_LIFETIME";

export function BillingOptions({
  isPro,
  currentPlan,
  hasRecurringSubscription,
  userKey,
}: {
  isPro: boolean;
  currentPlan: ProPlan | null;
  hasRecurringSubscription: boolean;
  userKey: string | null;
}) {
  const surface = useSyncExternalStore<ProPurchaseSurface | null>(
    subscribeToStaticNativeEnvironment,
    () => {
      const availability = getAppleStoreKitAvailability();
      return selectProPurchaseSurface({
        native: availability.native,
        platform: availability.platform,
        applePluginAvailable: availability.pluginAvailable,
      });
    },
    () => null
  );

  if (surface === null) {
    return (
      <div className="grid gap-5 lg:grid-cols-3" aria-label="Loading billing options">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-5 rounded-3xl border border-border/80 p-6 sm:p-7">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="size-11 rounded-xl" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (surface === "NATIVE_APPLE_UNAVAILABLE") {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/75 p-6 text-center sm:p-8">
        <h2 className="text-xl font-semibold">Purchases unavailable</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Purchases are unavailable in this version of the app. Please update
          Calistheni. Your existing Pro access remains available after sign-in.
        </p>
      </div>
    );
  }

  if (surface === "NATIVE_APPLE") {
    return <ApplePurchaseOptions isPro={isPro} userKey={userKey} />;
  }

  return (
    <CheckoutButtons
      isPro={isPro}
      currentPlan={currentPlan}
      hasRecurringSubscription={hasRecurringSubscription}
    />
  );
}

function subscribeToStaticNativeEnvironment() {
  return () => undefined;
}
