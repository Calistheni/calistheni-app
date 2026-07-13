import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, getStripeProPriceIds } from "@/lib/stripe";

function getSessionCustomerId(session: Stripe.Checkout.Session) {
  if (!session.customer) return null;
  return typeof session.customer === "string"
    ? session.customer
    : session.customer.id;
}

export async function syncStripeLifetimeCheckout(
  session: Stripe.Checkout.Session
) {
  if (
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.metadata?.plan !== "PRO_LIFETIME"
  ) {
    throw new Error("Lifetime Checkout is not complete and paid.");
  }

  const metadataUserId = session.metadata.userId;
  const referenceUserId = session.client_reference_id;
  if (!metadataUserId || !referenceUserId || metadataUserId !== referenceUserId) {
    throw new Error("Lifetime Checkout user metadata is missing or inconsistent.");
  }

  const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, {
    limit: 10,
  });
  const lineItem = lineItems.data[0];
  const price = lineItem?.price;
  const lifetimePriceId = getStripeProPriceIds().PRO_LIFETIME;

  if (
    lineItems.has_more ||
    lineItems.data.length !== 1 ||
    !price ||
    price.id !== lifetimePriceId ||
    price.type !== "one_time" ||
    price.currency !== "eur" ||
    price.unit_amount !== 7999 ||
    lineItem.quantity !== 1
  ) {
    throw new Error("Lifetime Checkout line item does not match the configured offer.");
  }

  const user = await prisma.user.findUnique({
    where: { id: metadataUserId },
    select: { id: true },
  });
  if (!user) throw new Error("Lifetime Checkout user does not exist.");

  const stripeCustomerId = getSessionCustomerId(session);

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.subscription.findUnique({
      where: { stripeLifetimeCheckoutSessionId: session.id },
    });
    if (duplicate) {
      if (duplicate.userId !== user.id) {
        throw new Error("Lifetime Checkout is already mapped to another user.");
      }
      return duplicate;
    }

    const existing = await tx.subscription.findUnique({
      where: { userId: user.id },
    });
    if (
      existing?.stripeCustomerId &&
      stripeCustomerId &&
      existing.stripeCustomerId !== stripeCustomerId
    ) {
      throw new Error("Lifetime Checkout customer does not match the user billing record.");
    }
    if (existing?.lifetimePurchasedAt) return existing;

    const data = {
      plan: "PRO_LIFETIME" as const,
      status: "INACTIVE" as const,
      stripePriceId: lifetimePriceId,
      stripeCustomerId: existing?.stripeCustomerId || stripeCustomerId,
      stripeLifetimeCheckoutSessionId: session.id,
      lifetimePurchasedAt: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };

    return tx.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  });
}
