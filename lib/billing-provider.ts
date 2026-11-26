import type { ApplePurchase, Subscription } from "@/lib/generated/prisma/client";

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

type StripeBillingRecord = Pick<
  Subscription,
  "plan" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "lifetimePurchasedAt"
>;
type AppleBillingRecord = Pick<
  ApplePurchase,
  "environment" | "productKind" | "state" | "expiresAt" | "revokedAt" | "autoRenewStatus"
>;

export function getStripeManagementState(subscription: StripeBillingRecord | null) {
  if (!subscription) return "none";
  const { plan, status, stripeCustomerId, stripeSubscriptionId, lifetimePurchasedAt } = subscription;
  if (lifetimePurchasedAt && stripeSubscriptionId && status === "INACTIVE") {
    // A lifetime purchase can leave a prior recurring ID and overwrite its status.
    return "uncertain";
  }
  if (status === "CANCELED" || status === "INACTIVE" || status === "INCOMPLETE_EXPIRED") return "none";
  if (stripeCustomerId && stripeSubscriptionId) return "managed";
  if (stripeCustomerId || stripeSubscriptionId || plan === "PRO_MONTHLY" || plan === "PRO_YEARLY") return "uncertain";
  return "none";
}

export function getAccountSubscriptionManagement(
  subscription: StripeBillingRecord | null,
  applePurchases: AppleBillingRecord[],
  now = new Date()
) {
  return {
    stripe: getStripeManagementState(subscription),
    apple: applePurchases.some((purchase) => {
      if (
        purchase.environment !== "PRODUCTION" ||
        purchase.productKind !== "SUBSCRIPTION" ||
        purchase.revokedAt ||
        purchase.state === "REVOKED"
      ) return false;
      if (purchase.state === "GRACE_PERIOD" || purchase.state === "BILLING_RETRY") return true;
      if (purchase.state === "EXPIRED") return purchase.autoRenewStatus === true;
      return !purchase.expiresAt || purchase.expiresAt > now || purchase.autoRenewStatus !== false;
    }),
  };
}

export type AccountSubscriptionManagement = ReturnType<typeof getAccountSubscriptionManagement>;
