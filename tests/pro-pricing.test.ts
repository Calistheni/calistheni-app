import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PRO_PRICE_EUR_CENTS,
  PRO_PRICE_LABELS,
  PRO_YEARLY_SAVINGS_EUR_CENTS,
  PRO_YEARLY_SAVINGS_PERCENT,
} from "../lib/pro-pricing.ts";

test("current Pro pricing and yearly savings are exact", () => {
  assert.deepEqual(PRO_PRICE_EUR_CENTS, {
    monthly: 799,
    yearly: 5999,
    lifetime: 11999,
  });
  assert.deepEqual(PRO_PRICE_LABELS, {
    monthly: "€7.99",
    yearly: "€59.99",
    lifetime: "€119.99",
  });
  assert.equal(PRO_PRICE_EUR_CENTS.monthly * 12, 9588);
  assert.equal(PRO_YEARLY_SAVINGS_EUR_CENTS, 3589);
  assert.equal(PRO_YEARLY_SAVINGS_PERCENT, 37);
});

test("Stripe catalog setup creates only the current offer amounts", async () => {
  const [setupSource, checkoutUi, subscriptionSync, lifetimeSync] =
    await Promise.all([
      readFile(
        new URL("../scripts/ensure-stripe-pro-prices.mjs", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../components/billing/CheckoutButtons.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../lib/stripe-subscriptions.ts", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../lib/stripe-lifetime.ts", import.meta.url),
        "utf8"
      ),
    ]);

  assert.match(setupSource, /findOrCreateRecurringPrice\(799, "month"\)/);
  assert.match(setupSource, /findOrCreateRecurringPrice\(5999, "year"\)/);
  assert.match(setupSource, /price\.unit_amount === 11999/);
  assert.match(setupSource, /unit_amount: 11999/);
  assert.doesNotMatch(setupSource, /prices\.update\([^)]*,\s*\{\s*active:\s*false/);
  assert.doesNotMatch(setupSource, /subscriptions\.(?:update|cancel|del)/);
  assert.match(checkoutUi, /price: PRO_PRICE_LABELS\.monthly/);
  assert.match(checkoutUi, /price: PRO_PRICE_LABELS\.yearly/);
  assert.match(checkoutUi, /price: PRO_PRICE_LABELS\.lifetime/);
  assert.match(
    subscriptionSync,
    /existing\?\.stripePriceId \?\? getStripeProPriceIds\(\)\.PRO_LIFETIME/
  );
  assert.match(lifetimeSync, /stripeLifetimeCheckoutSessionId: session\.id/);
});
