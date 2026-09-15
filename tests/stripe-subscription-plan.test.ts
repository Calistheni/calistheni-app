import assert from "node:assert/strict";
import test from "node:test";
import { resolveStripeRecurringPlan } from "../lib/stripe-subscription-plan.ts";

const currentPriceIds = {
  PRO_MONTHLY: "price_new_monthly",
  PRO_YEARLY: "price_new_yearly",
};

test("new recurring prices resolve to their current plans", () => {
  assert.deepEqual(
    resolveStripeRecurringPlan({
      items: [{ priceId: "price_new_monthly", currentPeriodEnd: 123 }],
      configuredPriceIds: currentPriceIds,
      storedSubscription: null,
    }),
    {
      plan: "PRO_MONTHLY",
      priceId: "price_new_monthly",
      currentPeriodEnd: 123,
    }
  );
});

for (const [plan, legacyPriceId] of [
  ["PRO_MONTHLY", "price_old_monthly"],
  ["PRO_YEARLY", "price_old_yearly"],
] as const) {
  test(`${plan} remains grandfathered when Stripe reports its stored legacy Price`, () => {
    assert.deepEqual(
      resolveStripeRecurringPlan({
        items: [{ priceId: legacyPriceId, currentPeriodEnd: 456 }],
        configuredPriceIds: currentPriceIds,
        storedSubscription: { plan, stripePriceId: legacyPriceId },
      }),
      { plan, priceId: legacyPriceId, currentPeriodEnd: 456 }
    );
  });
}

test("an unrelated Price cannot inherit a stored Pro plan", () => {
  assert.equal(
    resolveStripeRecurringPlan({
      items: [{ priceId: "price_unrelated", currentPeriodEnd: 789 }],
      configuredPriceIds: currentPriceIds,
      storedSubscription: {
        plan: "PRO_MONTHLY",
        stripePriceId: "price_old_monthly",
      },
    }),
    null
  );
});
