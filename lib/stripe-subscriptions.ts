import "server-only";

import type Stripe from "stripe";
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeProPriceIds } from "@/lib/stripe";

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: "ACTIVE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  past_due: "PAST_DUE",
  paused: "PAUSED",
  trialing: "TRIALING",
  unpaid: "UNPAID",
};

function getCustomerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

function getKnownPlan(subscription: Stripe.Subscription) {
  const priceIds = getStripeProPriceIds();
  const item = subscription.items.data.find(
    ({ price }) =>
      price.id === priceIds.PRO_MONTHLY || price.id === priceIds.PRO_YEARLY
  );

  if (!item) {
    return {
      plan: "FREE" as SubscriptionPlan,
      priceId: subscription.items.data[0]?.price.id ?? null,
      currentPeriodEnd: null,
    };
  }

  return {
    plan: (item.price.id === priceIds.PRO_MONTHLY
      ? "PRO_MONTHLY"
      : "PRO_YEARLY") as SubscriptionPlan,
    priceId: item.price.id,
    // Stripe SDK 22 / API 2026-06-24 moves the billing period onto the item.
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  };
}

export async function syncStripeSubscription(
  stripeSubscription: Stripe.Subscription,
  fallbackUserId?: string | null
) {
  const stripeCustomerId = getCustomerId(stripeSubscription);
  const existing = await prisma.subscription.findFirst({
    where: {
      OR: [
        { stripeSubscriptionId: stripeSubscription.id },
        { stripeCustomerId },
      ],
    },
    select: { userId: true, lifetimePurchasedAt: true },
  });
  const candidateUserId =
    existing?.userId || stripeSubscription.metadata.userId || fallbackUserId;

  if (!candidateUserId) {
    throw new Error("Unable to map Stripe subscription to an application user.");
  }

  const user = await prisma.user.findUnique({
    where: { id: candidateUserId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("Mapped Stripe subscription user does not exist.");
  }

  const { plan, priceId, currentPeriodEnd } = getKnownPlan(stripeSubscription);
  const hasLifetime = Boolean(existing?.lifetimePurchasedAt);
  const data = {
    stripeCustomerId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: hasLifetime
      ? getStripeProPriceIds().PRO_LIFETIME
      : priceId,
    plan: hasLifetime ? ("PRO_LIFETIME" as const) : plan,
    status: hasLifetime
      ? ("INACTIVE" as const)
      : STATUS_MAP[stripeSubscription.status],
    currentPeriodEnd: hasLifetime ? null : currentPeriodEnd,
    cancelAtPeriodEnd: hasLifetime
      ? false
      : stripeSubscription.cancel_at_period_end,
  };

  return prisma.subscription.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
}
