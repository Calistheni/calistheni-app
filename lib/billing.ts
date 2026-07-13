import "server-only";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function getOrCreateStripeCustomer(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      subscription: { select: { stripeCustomerId: true } },
    },
  });

  if (!user) throw new Error("Authenticated user does not exist.");
  if (user.subscription?.stripeCustomerId) {
    return user.subscription.stripeCustomerId;
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      metadata: { userId },
    },
    { idempotencyKey: `calistheni-customer-${userId}` }
  );
  const persisted = await prisma.subscription.updateMany({
    where: { userId, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });

  if (persisted.count === 1) return customer.id;

  const concurrentResult = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });

  if (!concurrentResult?.stripeCustomerId) {
    throw new Error("Unable to persist Stripe customer.");
  }

  return concurrentResult.stripeCustomerId;
}
