"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { Button } from "@/components/ui/button";
import {
  selectProPurchaseSurface,
  selectSubscriptionManagement,
  type BillingGrantSummary,
  type ProPurchaseSurface,
} from "@/lib/billing-provider";
import {
  getAppleStoreKitAvailability,
  showAppleSubscriptionManagement,
} from "@/lib/native/apple-storekit";

export function ProviderManagementAction({
  grants,
}: {
  grants: BillingGrantSummary[];
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
  const [loading, setLoading] = useState(false);

  if (!surface) return null;
  const management = selectSubscriptionManagement({ surface, grants });
  if (management === "STRIPE") {
    return <ManageSubscriptionButton variant="outline" />;
  }
  if (management !== "APPLE") return null;

  async function manageAppleSubscription() {
    if (loading) return;
    setLoading(true);
    try {
      await showAppleSubscriptionManagement();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Subscription management is unavailable right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={() => void manageAppleSubscription()}
    >
      {loading ? "Opening Subscriptions..." : "Manage Subscription"}
    </Button>
  );
}

function subscribeToStaticNativeEnvironment() {
  return () => undefined;
}
