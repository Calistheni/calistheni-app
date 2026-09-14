import assert from "node:assert/strict";
import test from "node:test";
import { buildStripeCheckoutSessionParameters } from "../lib/stripe-checkout-request.ts";

for (const [plan, expectedMode] of [
  ["PRO_MONTHLY", "subscription"],
  ["PRO_YEARLY", "subscription"],
  ["PRO_LIFETIME", "payment"],
] as const) {
  test(`${plan} creates a ${expectedMode} Checkout Session request`, () => {
    const request = buildStripeCheckoutSessionParameters({
      plan,
      userId: "user_123",
      customerId: "cus_123",
      priceId: `price_${plan}`,
      siteUrl: "https://calistheni.app",
    });

    assert.equal(request.mode, expectedMode);
    assert.equal(request.customer, "cus_123");
    assert.deepEqual(request.line_items, [
      { price: `price_${plan}`, quantity: 1 },
    ]);
    assert.equal(typeof request.success_url, "string");
    assert.equal(typeof request.cancel_url, "string");
    assert.equal(
      new URL(request.success_url!).origin,
      "https://calistheni.app"
    );
    assert.equal(new URL(request.cancel_url!).origin, "https://calistheni.app");
    if (plan === "PRO_LIFETIME") {
      assert.ok(request.payment_intent_data);
      assert.equal(request.subscription_data, undefined);
    } else {
      assert.ok(request.subscription_data);
      assert.equal(request.payment_intent_data, undefined);
    }
  });
}
