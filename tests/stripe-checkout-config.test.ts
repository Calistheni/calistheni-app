import assert from "node:assert/strict";
import test from "node:test";
import {
  getStripeModeFromEnvironment,
  getStripePriceIdsFromEnvironment,
  getStripeSecretFromEnvironment,
  validateStripeCatalog,
} from "../lib/stripe-config.ts";

const liveEnvironment = {
  VERCEL_ENV: "production",
  STRIPE_MODE: "live",
  STRIPE_SECRET_KEY: "sk_live_example",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_unused",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_yearly",
  STRIPE_PRO_LIFETIME_PRICE_ID: "price_lifetime",
};

const productId = "prod_pro";
const validCatalog = {
  mode: "live" as const,
  accountId: "acct_live",
  configuredAccountId: "acct_live",
  monthly: {
    livemode: true,
    active: true,
    currency: "eur",
    unitAmount: 799,
    type: "recurring" as const,
    recurringInterval: "month",
    recurringIntervalCount: 1,
    productId,
  },
  yearly: {
    livemode: true,
    active: true,
    currency: "eur",
    unitAmount: 5999,
    type: "recurring" as const,
    recurringInterval: "year",
    recurringIntervalCount: 1,
    productId,
  },
  lifetime: {
    livemode: true,
    active: true,
    currency: "eur",
    unitAmount: 11999,
    type: "one_time" as const,
    recurringInterval: null,
    recurringIntervalCount: null,
    productId,
  },
  product: { livemode: true, active: true, name: "Calistheni Pro" },
};

test("valid live server Checkout config does not depend on an unused publishable key", () => {
  const mode = getStripeModeFromEnvironment(liveEnvironment);
  assert.equal(mode, "live");
  assert.equal(
    getStripeSecretFromEnvironment(liveEnvironment, mode),
    "sk_live_example"
  );
  assert.deepEqual(getStripePriceIdsFromEnvironment(liveEnvironment), {
    PRO_MONTHLY: "price_monthly",
    PRO_YEARLY: "price_yearly",
    PRO_LIFETIME: "price_lifetime",
  });
  assert.doesNotThrow(() => validateStripeCatalog(validCatalog));
});

test("Production rejects test mode and a test secret for live mode", () => {
  assert.throws(
    () =>
      getStripeModeFromEnvironment({
        ...liveEnvironment,
        STRIPE_MODE: "test",
      }),
    /Production requires STRIPE_MODE=live/
  );
  assert.throws(
    () =>
      getStripeSecretFromEnvironment(
        { ...liveEnvironment, STRIPE_SECRET_KEY: "sk_test_example" },
        "live"
      ),
    /mode does not match/
  );
});

test("missing live secret and missing or malformed price IDs fail safely", () => {
  assert.throws(
    () => getStripeSecretFromEnvironment(liveEnvironment, "test"),
    /mode does not match/
  );
  assert.throws(
    () =>
      getStripeSecretFromEnvironment(
        { ...liveEnvironment, STRIPE_SECRET_KEY: undefined },
        "live"
      ),
    /Missing required server environment variable: STRIPE_SECRET_KEY/
  );
  assert.throws(
    () =>
      getStripePriceIdsFromEnvironment({
        ...liveEnvironment,
        STRIPE_PRO_MONTHLY_PRICE_ID: undefined,
      }),
    /STRIPE_PRO_MONTHLY_PRICE_ID/
  );
  assert.throws(
    () =>
      getStripePriceIdsFromEnvironment({
        ...liveEnvironment,
        STRIPE_PRO_MONTHLY_PRICE_ID: "invalid",
      }),
    /not a valid Stripe Price ID/
  );
});

test("test-mode and inactive prices are rejected by live catalog validation", () => {
  assert.throws(
    () =>
      validateStripeCatalog({
        ...validCatalog,
        monthly: { ...validCatalog.monthly, livemode: false },
      }),
    /Price mode does not match/
  );
  assert.throws(
    () =>
      validateStripeCatalog({
        ...validCatalog,
        yearly: { ...validCatalog.yearly, active: false },
      }),
    /Prices must be active/
  );
});

test("old public prices cannot be selected for new Checkout Sessions", () => {
  assert.throws(
    () =>
      validateStripeCatalog({
        ...validCatalog,
        monthly: { ...validCatalog.monthly, unitAmount: 499 },
      }),
    /€7\.99 EUR recurring monthly/
  );
  assert.throws(
    () =>
      validateStripeCatalog({
        ...validCatalog,
        yearly: { ...validCatalog.yearly, unitAmount: 3999 },
      }),
    /€59\.99 EUR recurring yearly/
  );
  assert.throws(
    () =>
      validateStripeCatalog({
        ...validCatalog,
        lifetime: { ...validCatalog.lifetime, unitAmount: 7999 },
      }),
    /€119\.99 EUR one-time Price/
  );
});
