export type ProPurchaseSurface =
  | "WEB_STRIPE"
  | "NATIVE_APPLE"
  | "NATIVE_APPLE_UNAVAILABLE";

export type BillingGrantSummary =
  | {
      provider: "STRIPE";
      kind: "SUBSCRIPTION" | "LIFETIME";
      plan: "PRO_MONTHLY" | "PRO_YEARLY" | "PRO_LIFETIME";
      expiresAt: string | null;
    }
  | {
      provider: "APPLE";
      kind: "SUBSCRIPTION" | "LIFETIME";
      productId: string;
      expiresAt: string | null;
    };

export function selectProPurchaseSurface({
  native,
  platform,
  applePluginAvailable,
}: {
  native: boolean;
  platform: string;
  applePluginAvailable: boolean;
}): ProPurchaseSurface {
  if (!native || platform !== "ios") return "WEB_STRIPE";
  return applePluginAvailable ? "NATIVE_APPLE" : "NATIVE_APPLE_UNAVAILABLE";
}

export function selectSubscriptionManagement({
  surface,
  grants,
}: {
  surface: ProPurchaseSurface;
  grants: BillingGrantSummary[];
}) {
  const hasAppleSubscription = grants.some(
    (grant) => grant.provider === "APPLE" && grant.kind === "SUBSCRIPTION"
  );
  const hasStripeSubscription = grants.some(
    (grant) => grant.provider === "STRIPE" && grant.kind === "SUBSCRIPTION"
  );

  if (surface === "NATIVE_APPLE" && hasAppleSubscription) return "APPLE";
  if (surface === "WEB_STRIPE" && hasStripeSubscription) return "STRIPE";
  return "NONE";
}
