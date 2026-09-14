import "server-only";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { resolveStripeCustomer } from "@/lib/stripe-customer-recovery";

export async function getOrCreateStripeCustomer(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      subscription: { select: { stripeCustomerId: true } },
    },
  });

  if (!user) throw new Error("Authenticated user does not exist.");

  if (!user.subscription) {
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  const stripe = getStripe();
  const resolution = await resolveStripeCustomer({
    existingCustomerId: user.subscription?.stripeCustomerId ?? null,
    retrieveCustomer: (customerId) => stripe.customers.retrieve(customerId),
    createCustomer: async () => {
      const customer = await stripe.customers.create(
        {
          ...(user.email ? { email: user.email } : {}),
          metadata: { userId },
        },
        { idempotencyKey: `calistheni-customer-${userId}` }
      );
      return customer.id;
    },
    persistCustomer: async (customerId, expectedCustomerId) => {
      const persisted = await prisma.subscription.updateMany({
        where: { userId, stripeCustomerId: expectedCustomerId },
        data: { stripeCustomerId: customerId },
      });
      return persisted.count === 1;
    },
    readPersistedCustomer: async () => {
      const concurrentResult = await prisma.subscription.findUnique({
        where: { userId },
        select: { stripeCustomerId: true },
      });
      return concurrentResult?.stripeCustomerId ?? null;
    },
  });

  if (
    resolution.state === "recovered_missing" ||
    resolution.state === "recovered_deleted"
  ) {
    console.info("[billing.customer]", {
      event: "stale_customer_recovered",
      userId,
      recoveryReason:
        resolution.state === "recovered_missing" ? "missing" : "deleted",
    });
  }

  return resolution.customerId;
}
