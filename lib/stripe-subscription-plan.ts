export type RecurringProPlan = "PRO_MONTHLY" | "PRO_YEARLY";

type StripeSubscriptionItemSnapshot = {
  priceId: string;
  currentPeriodEnd: number;
};

type StoredSubscriptionSnapshot = {
  plan: string;
  stripePriceId: string | null;
} | null;

export function resolveStripeRecurringPlan({
  items,
  configuredPriceIds,
  storedSubscription,
}: {
  items: StripeSubscriptionItemSnapshot[];
  configuredPriceIds: {
    PRO_MONTHLY: string;
    PRO_YEARLY: string;
  };
  storedSubscription: StoredSubscriptionSnapshot;
}) {
  const currentPriceItem = items.find(
    (item) =>
      item.priceId === configuredPriceIds.PRO_MONTHLY ||
      item.priceId === configuredPriceIds.PRO_YEARLY
  );

  if (currentPriceItem) {
    return {
      plan: (currentPriceItem.priceId === configuredPriceIds.PRO_MONTHLY
        ? "PRO_MONTHLY"
        : "PRO_YEARLY") as RecurringProPlan,
      priceId: currentPriceItem.priceId,
      currentPeriodEnd: currentPriceItem.currentPeriodEnd,
    };
  }

  const storedPlan = storedSubscription?.plan;
  const storedPriceId = storedSubscription?.stripePriceId;
  if (
    storedPriceId &&
    (storedPlan === "PRO_MONTHLY" || storedPlan === "PRO_YEARLY")
  ) {
    const grandfatheredItem = items.find(
      (item) => item.priceId === storedPriceId
    );
    if (grandfatheredItem) {
      return {
        plan: storedPlan,
        priceId: grandfatheredItem.priceId,
        currentPeriodEnd: grandfatheredItem.currentPeriodEnd,
      };
    }
  }

  return null;
}
