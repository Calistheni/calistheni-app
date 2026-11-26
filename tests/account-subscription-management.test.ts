import assert from "node:assert/strict";
import test from "node:test";
import { getAccountSubscriptionManagement } from "../lib/billing-provider.ts";

type StripeRecord = NonNullable<Parameters<typeof getAccountSubscriptionManagement>[0]>;
type AppleRecord = Parameters<typeof getAccountSubscriptionManagement>[1][number];
const now = new Date("2026-11-26T12:00:00Z");
const stripe: StripeRecord = {
  plan: "PRO_MONTHLY",
  status: "ACTIVE",
  stripeCustomerId: "website-customer",
  stripeSubscriptionId: "website-subscription",
  lifetimePurchasedAt: null,
};
const apple: AppleRecord = {
  environment: "PRODUCTION",
  productKind: "SUBSCRIPTION",
  state: "ACTIVE",
  expiresAt: new Date("2026-12-26T12:00:00Z"),
  revokedAt: null,
  autoRenewStatus: true,
};

test("Stripe subscriptions with billing problems remain manageable alongside Apple", () => {
  for (const status of ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID", "INCOMPLETE", "PAUSED"] as const) {
    assert.deepEqual(getAccountSubscriptionManagement({ ...stripe, status }, [apple], now), {
      stripe: "managed",
      apple: true,
    });
  }
  for (const status of ["CANCELED", "INACTIVE", "INCOMPLETE_EXPIRED"] as const) {
    assert.equal(getAccountSubscriptionManagement({ ...stripe, status }, [], now).stripe, "none");
  }
});

test("Apple billing retry and grace remain manageable without an active entitlement", () => {
  for (const state of ["BILLING_RETRY", "GRACE_PERIOD"] as const) {
    assert.equal(getAccountSubscriptionManagement(null, [{ ...apple, state, expiresAt: now }], now).apple, true);
  }
  for (const purchase of [
    { ...apple, state: "EXPIRED", expiresAt: now, autoRenewStatus: false },
    { ...apple, state: "REVOKED" },
    { ...apple, environment: "SANDBOX" },
    { ...apple, productKind: "LIFETIME" },
  ] as const) {
    assert.equal(getAccountSubscriptionManagement(null, [purchase], now).apple, false);
  }
  assert.equal(getAccountSubscriptionManagement(null, [{ ...apple, autoRenewStatus: false }], now).apple, true);
});

test("lifetime without a recurring record points to plans, while ambiguous Stripe records stay visible", () => {
  assert.deepEqual(getAccountSubscriptionManagement(null, [], now), { stripe: "none", apple: false });
  const lifetime = { ...stripe, plan: "PRO_LIFETIME", status: "INACTIVE", lifetimePurchasedAt: now } as const;
  assert.equal(getAccountSubscriptionManagement({ ...lifetime, stripeSubscriptionId: null }, [], now).stripe, "none");
  assert.equal(getAccountSubscriptionManagement(lifetime, [], now).stripe, "uncertain");
  assert.equal(getAccountSubscriptionManagement({ ...stripe, stripeCustomerId: null }, [], now).stripe, "uncertain");
});
