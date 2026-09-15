import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAppleNotificationAction } from "../lib/apple-iap/notification-actions.ts";
import {
  APPLE_SUBSCRIPTION_STATUS,
  deriveApplePurchaseSnapshot,
  shouldApplyAppleAggregateUpdate,
} from "../lib/apple-iap/state.ts";
import type { AppleVerifiedTransaction } from "../lib/apple-iap/verification-types.ts";

const root = new URL("../", import.meta.url);
const now = new Date("2026-09-15T12:00:00Z");

function transaction(
  overrides: Partial<AppleVerifiedTransaction> = {}
): AppleVerifiedTransaction {
  return {
    environment: "PRODUCTION",
    transactionId: "200000000001",
    originalTransactionId: "100000000001",
    bundleId: "com.petershikrenov.calistheni",
    productId: "com.petershikrenov.calistheni.pro.monthly",
    productKind: "SUBSCRIPTION",
    appAccountToken: "11111111-1111-4111-8111-111111111111",
    purchaseDate: new Date("2026-08-15T12:00:00Z"),
    expiresDate: new Date("2026-09-14T12:00:00Z"),
    revocationDate: null,
    ownershipType: "PURCHASED",
    signedDate: new Date("2026-09-15T11:00:00Z"),
    payloadHash: "a".repeat(64),
    ...overrides,
  };
}

test("TEST notification is audit-only and cannot grant Pro", () => {
  assert.equal(
    getAppleNotificationAction({
      notificationType: "TEST",
      transaction: transaction(),
      renewalInfo: null,
    }),
    "IGNORE_TEST"
  );
});

test("notifications route transactions and renewal-only events safely", () => {
  assert.equal(
    getAppleNotificationAction({
      notificationType: "DID_RENEW",
      transaction: transaction(),
      renewalInfo: null,
    }),
    "SYNC_TRANSACTION"
  );
  assert.equal(
    getAppleNotificationAction({
      notificationType: "DID_CHANGE_RENEWAL_STATUS",
      transaction: null,
      renewalInfo: {
        environment: "PRODUCTION",
        originalTransactionId: "100000000001",
        productId: "com.petershikrenov.calistheni.pro.monthly",
        appAccountToken: null,
        autoRenewStatus: false,
        gracePeriodExpiresDate: null,
        isInBillingRetryPeriod: false,
        signedDate: now,
      },
    }),
    "SYNC_RENEWAL"
  );
});

test("verified grace, retry, expiration, and revocation derive factual state", () => {
  const renewal = {
    environment: "PRODUCTION" as const,
    originalTransactionId: "100000000001",
    productId: "com.petershikrenov.calistheni.pro.monthly",
    appAccountToken: null,
    autoRenewStatus: false,
    gracePeriodExpiresDate: new Date(now.getTime() + 60_000),
    isInBillingRetryPeriod: true,
    signedDate: now,
  };
  assert.equal(
    deriveApplePurchaseSnapshot({
      transaction: transaction(),
      renewalInfo: renewal,
      subscriptionStatus: APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE_PERIOD,
      now,
    }).state,
    "GRACE_PERIOD"
  );
  assert.equal(
    deriveApplePurchaseSnapshot({
      transaction: transaction(),
      renewalInfo: { ...renewal, gracePeriodExpiresDate: null },
      subscriptionStatus: APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY,
      now,
    }).state,
    "BILLING_RETRY"
  );
  assert.equal(
    deriveApplePurchaseSnapshot({
      transaction: transaction(),
      subscriptionStatus: APPLE_SUBSCRIPTION_STATUS.EXPIRED,
      now,
    }).state,
    "EXPIRED"
  );
  assert.equal(
    deriveApplePurchaseSnapshot({
      transaction: transaction({ revocationDate: now }),
      subscriptionStatus: APPLE_SUBSCRIPTION_STATUS.REVOKED,
      now,
    }).state,
    "REVOKED"
  );
  assert.equal(
    deriveApplePurchaseSnapshot({
      transaction: transaction({
        productId: "com.petershikrenov.calistheni.pro.lifetime",
        productKind: "LIFETIME",
        expiresDate: null,
        revocationDate: null,
        signedDate: new Date(now.getTime() + 1),
      }),
      now,
    }).state,
    "ACTIVE",
    "a newer verified lifetime refund reversal restores factual state"
  );
});

test("older signed state cannot overwrite newer aggregate state", () => {
  assert.equal(
    shouldApplyAppleAggregateUpdate(
      new Date("2026-09-15T12:00:00Z"),
      new Date("2026-09-15T11:59:59Z")
    ),
    false
  );
  assert.equal(
    shouldApplyAppleAggregateUpdate(
      new Date("2026-09-15T12:00:00Z"),
      new Date("2026-09-15T12:00:01Z")
    ),
    true
  );
});

test("notification and transaction database idempotency is constrained", async () => {
  const schema = await readFile(new URL("prisma/schema.prisma", root), "utf8");
  const service = await readFile(
    new URL("lib/apple-iap/notifications.ts", root),
    "utf8"
  );
  assert.match(schema, /notificationUUID\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[environment, transactionId\]\)/);
  assert.match(
    schema,
    /@@unique\(\[environment, originalTransactionId\]\)/
  );
  assert.match(service, /processingStatus === "PROCESSED"/);
  assert.match(service, /error\.code !== "P2002"/);
});

test("measurement feature authorization uses unified entitlements", async () => {
  const collection = await readFile(
    new URL("app/api/user/measurements/route.ts", root),
    "utf8"
  );
  const item = await readFile(
    new URL("app/api/user/measurements/[id]/route.ts", root),
    "utf8"
  );
  for (const source of [collection, item]) {
    assert.match(source, /getUserEntitlements\(userId\)/);
    assert.doesNotMatch(source, /hasProAccess/);
  }
});

test("Apple client configuration and synchronization routes require auth and expose safe fields", async () => {
  const [configRoute, syncRoute] = await Promise.all([
    readFile(new URL("app/api/billing/apple/config/route.ts", root), "utf8"),
    readFile(
      new URL("app/api/billing/apple/transactions/sync/route.ts", root),
      "utf8"
    ),
  ]);
  for (const source of [configRoute, syncRoute]) {
    assert.match(source, /getAuthenticatedUserId\(\)/);
    assert.match(source, /createUserUnauthorizedResponse\(\)/);
  }
  assert.match(configRoute, /appAccountToken: account\.appAccountToken/);
  assert.match(configRoute, /productIds: configuration\.productIds/);
  assert.doesNotMatch(configRoute, /APPLE_IAP_PRIVATE_KEY/);
  assert.doesNotMatch(configRoute, /privateKey/);
});
