import type {
  AppleProductKind,
  ApplePurchase,
  ApplePurchaseState,
  Subscription,
} from "@/lib/generated/prisma/client";
import { APPLE_PRO_PRODUCT_IDS } from "@/lib/apple-iap/products";

type StripeEntitlementInput =
  | Pick<Subscription, "plan" | "status" | "lifetimePurchasedAt">
  | null
  | undefined;

export type AppleEntitlementInput = Pick<
  ApplePurchase,
  | "environment"
  | "productId"
  | "productKind"
  | "state"
  | "expiresAt"
  | "gracePeriodExpiresAt"
  | "revokedAt"
>;

export type ProEntitlementGrant =
  | {
      provider: "STRIPE";
      kind: "SUBSCRIPTION" | "LIFETIME";
      plan: "PRO_MONTHLY" | "PRO_YEARLY" | "PRO_LIFETIME";
      expiresAt: Date | null;
    }
  | {
      provider: "APPLE";
      kind: "SUBSCRIPTION" | "LIFETIME";
      productId: string;
      expiresAt: Date | null;
    };

export function resolveStripeProGrant(
  subscription: StripeEntitlementInput
): ProEntitlementGrant | null {
  if (subscription?.lifetimePurchasedAt) {
    return {
      provider: "STRIPE",
      kind: "LIFETIME",
      plan: "PRO_LIFETIME",
      expiresAt: null,
    };
  }
  if (
    (subscription?.plan === "PRO_MONTHLY" ||
      subscription?.plan === "PRO_YEARLY") &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING")
  ) {
    return {
      provider: "STRIPE",
      kind: "SUBSCRIPTION",
      plan: subscription.plan,
      expiresAt: null,
    };
  }
  return null;
}

function isKnownAppleProduct(
  productId: string,
  productKind: AppleProductKind
) {
  return productKind === "LIFETIME"
    ? productId === APPLE_PRO_PRODUCT_IDS.lifetime
    : productId === APPLE_PRO_PRODUCT_IDS.monthly ||
        productId === APPLE_PRO_PRODUCT_IDS.yearly;
}

function isEntitledAppleState(state: ApplePurchaseState) {
  return state !== "REVOKED";
}

export function resolveAppleProGrant(
  purchase: AppleEntitlementInput,
  now = new Date()
): ProEntitlementGrant | null {
  if (
    purchase.environment !== "PRODUCTION" ||
    purchase.revokedAt ||
    !isKnownAppleProduct(purchase.productId, purchase.productKind) ||
    !isEntitledAppleState(purchase.state)
  ) {
    return null;
  }

  if (purchase.productKind === "LIFETIME") {
    if (purchase.state !== "ACTIVE") return null;
    return {
      provider: "APPLE",
      kind: "LIFETIME",
      productId: purchase.productId,
      expiresAt: null,
    };
  }

  if (purchase.expiresAt && purchase.expiresAt.getTime() > now.getTime()) {
    return {
      provider: "APPLE",
      kind: "SUBSCRIPTION",
      productId: purchase.productId,
      expiresAt: purchase.expiresAt,
    };
  }

  if (
    purchase.state === "GRACE_PERIOD" &&
    purchase.gracePeriodExpiresAt &&
    purchase.gracePeriodExpiresAt.getTime() > now.getTime()
  ) {
    return {
      provider: "APPLE",
      kind: "SUBSCRIPTION",
      productId: purchase.productId,
      expiresAt: purchase.gracePeriodExpiresAt,
    };
  }

  return null;
}

export function resolveProEntitlementGrants({
  subscription,
  applePurchases,
  now = new Date(),
}: {
  subscription: StripeEntitlementInput;
  applePurchases: AppleEntitlementInput[];
  now?: Date;
}) {
  const grants: ProEntitlementGrant[] = [];
  const stripeGrant = resolveStripeProGrant(subscription);
  if (stripeGrant) grants.push(stripeGrant);
  for (const purchase of applePurchases) {
    const grant = resolveAppleProGrant(purchase, now);
    if (grant) grants.push(grant);
  }
  return { isPro: grants.length > 0, grants };
}
