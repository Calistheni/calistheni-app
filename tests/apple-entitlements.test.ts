import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAppleProGrant,
  resolveProEntitlementGrants,
} from "../lib/entitlement-resolution.ts";
import { APPLE_PRO_PRODUCT_IDS } from "../lib/apple-iap/products.ts";

const now = new Date("2026-09-15T12:00:00.000Z");

function stripe(overrides: Record<string, unknown> = {}) {
  return {
    plan: "FREE" as const,
    status: "INACTIVE" as const,
    lifetimePurchasedAt: null,
    ...overrides,
  };
}

function apple(overrides: Record<string, unknown> = {}) {
  return {
    environment: "PRODUCTION" as const,
    productId: APPLE_PRO_PRODUCT_IDS.monthly,
    productKind: "SUBSCRIPTION" as const,
    state: "ACTIVE" as const,
    expiresAt: new Date("2026-10-15T12:00:00.000Z"),
    gracePeriodExpiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function resolve(
  subscription: ReturnType<typeof stripe> | null,
  applePurchases: Array<ReturnType<typeof apple>> = []
) {
  return resolveProEntitlementGrants({ subscription, applePurchases, now });
}

test("existing Stripe monthly and yearly active subscriptions remain Pro", () => {
  assert.equal(
    resolve(stripe({ plan: "PRO_MONTHLY", status: "ACTIVE" })).isPro,
    true
  );
  assert.equal(
    resolve(stripe({ plan: "PRO_YEARLY", status: "TRIALING" })).isPro,
    true
  );
  assert.equal(
    resolve(
      stripe({
        plan: "PRO_MONTHLY",
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2026-10-01T12:00:00.000Z"),
      })
    ).isPro,
    true,
    "scheduled cancellation remains active until Stripe changes its status"
  );
});

test("existing Stripe lifetime remains Pro and expired Stripe is Free", () => {
  assert.equal(
    resolve(stripe({ lifetimePurchasedAt: new Date("2025-01-01") })).isPro,
    true
  );
  assert.equal(
    resolve(stripe({ plan: "PRO_MONTHLY", status: "CANCELED" })).isPro,
    false
  );
});

test("Production Apple subscription observes exact expiration boundaries", () => {
  assert.ok(resolveAppleProGrant(apple(), now));
  assert.equal(
    resolveAppleProGrant(
      apple({ expiresAt: new Date(now.getTime() + 1) }),
      now
    )?.provider,
    "APPLE"
  );
  assert.equal(
    resolveAppleProGrant(apple({ expiresAt: new Date(now.getTime()) }), now),
    null
  );
  assert.equal(
    resolveAppleProGrant(
      apple({ expiresAt: new Date(now.getTime() - 1) }),
      now
    ),
    null
  );
});

test("Production Apple lifetime grants Pro until revoked", () => {
  assert.ok(
    resolveAppleProGrant(
      apple({
        productId: APPLE_PRO_PRODUCT_IDS.lifetime,
        productKind: "LIFETIME",
        expiresAt: null,
      }),
      now
    )
  );
  assert.equal(
    resolveAppleProGrant(
      apple({
        productId: APPLE_PRO_PRODUCT_IDS.lifetime,
        productKind: "LIFETIME",
        expiresAt: null,
        state: "REVOKED",
        revokedAt: new Date("2026-09-01"),
      }),
      now
    ),
    null
  );
});

test("Sandbox subscriptions and lifetime purchases never grant ordinary Production Pro", () => {
  assert.equal(
    resolveAppleProGrant(apple({ environment: "SANDBOX" }), now),
    null
  );
  assert.equal(
    resolveAppleProGrant(
      apple({
        environment: "SANDBOX",
        productId: APPLE_PRO_PRODUCT_IDS.lifetime,
        productKind: "LIFETIME",
        expiresAt: null,
      }),
      now
    ),
    null
  );
});

test("valid Billing Grace Period grants through but not at its boundary", () => {
  const grace = apple({
    state: "GRACE_PERIOD",
    expiresAt: new Date(now.getTime() - 1),
    gracePeriodExpiresAt: new Date(now.getTime() + 1),
  });
  assert.ok(resolveAppleProGrant(grace, now));
  assert.equal(
    resolveAppleProGrant(
      apple({
        state: "GRACE_PERIOD",
        expiresAt: new Date(now.getTime() - 1),
        gracePeriodExpiresAt: new Date(now.getTime()),
      }),
      now
    ),
    null
  );
});

test("auto-renew-off semantics are driven by paid expiration, not renewal intent", () => {
  assert.ok(resolveAppleProGrant(apple(), now));
});

test("independent provider grants cannot revoke one another", () => {
  assert.equal(
    resolve(
      stripe({ plan: "PRO_MONTHLY", status: "ACTIVE" }),
      [apple({ state: "EXPIRED", expiresAt: new Date(now.getTime() - 1) })]
    ).isPro,
    true
  );
  assert.equal(
    resolve(stripe({ plan: "PRO_YEARLY", status: "CANCELED" }), [apple()])
      .isPro,
    true
  );
  assert.equal(
    resolve(stripe({ lifetimePurchasedAt: new Date("2025-01-01") }), [
      apple({ state: "REVOKED", revokedAt: new Date("2026-09-01") }),
    ]).isPro,
    true
  );
  assert.equal(
    resolve(stripe({ plan: "PRO_MONTHLY", status: "CANCELED" }), [
      apple({
        productId: APPLE_PRO_PRODUCT_IDS.lifetime,
        productKind: "LIFETIME",
        expiresAt: null,
      }),
    ]).isPro,
    true
  );
});
