import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStableAppleBillingAccount,
} from "../lib/apple-iap/account-core.ts";
import {
  AppleTransactionOwnershipError,
  synchronizeOwnedAppleTransaction,
  type AppleOwnershipRepository,
} from "../lib/apple-iap/ownership.ts";
import type { AppleVerifiedTransaction } from "../lib/apple-iap/verification-types.ts";

const tokenA = "11111111-1111-4111-8111-111111111111";
const tokenB = "22222222-2222-4222-8222-222222222222";

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
    appAccountToken: tokenA,
    purchaseDate: new Date("2026-09-15T12:00:00Z"),
    expiresDate: new Date("2026-10-15T12:00:00Z"),
    revocationDate: null,
    ownershipType: "PURCHASED",
    signedDate: new Date("2026-09-15T12:00:01Z"),
    payloadHash: "a".repeat(64),
    ...overrides,
  };
}

test("stable appAccountToken is reused", async () => {
  let stored: { userId: string; appAccountToken: string } | null = null;
  const dependencies = {
    userId: "user-a",
    findByUserId: async () => stored,
    create: async (userId: string, appAccountToken: string) =>
      (stored = { userId, appAccountToken }),
    createToken: () => tokenA,
  };
  const first = await resolveStableAppleBillingAccount(dependencies);
  const second = await resolveStableAppleBillingAccount(dependencies);
  assert.equal(first.appAccountToken, tokenA);
  assert.deepEqual(second, first);
});

test("concurrent account creation converges on one token", async () => {
  let stored: { userId: string; appAccountToken: string } | null = null;
  let creates = 0;
  const create = async (userId: string, appAccountToken: string) => {
    creates += 1;
    await Promise.resolve();
    if (stored) throw new Error("unique userId");
    stored = { userId, appAccountToken };
    return stored;
  };
  const [first, second] = await Promise.all([
    resolveStableAppleBillingAccount({
      userId: "user-a",
      findByUserId: async () => stored,
      create,
      createToken: () => tokenA,
    }),
    resolveStableAppleBillingAccount({
      userId: "user-a",
      findByUserId: async () => stored,
      create,
      createToken: () => tokenB,
    }),
  ]);
  assert.equal(creates, 2);
  assert.equal(first.appAccountToken, second.appAccountToken);
});

function repository(): AppleOwnershipRepository {
  const transactions = new Map<string, string>();
  const originals = new Map<string, string>();
  return {
    findUserIdByAppAccountToken: async (token) =>
      token === tokenA ? "user-a" : token === tokenB ? "user-b" : null,
    persistTransaction: async ({ userId, transaction: value }) => {
      const transactionKey = `${value.environment}:${value.transactionId}`;
      const originalKey = `${value.environment}:${value.originalTransactionId}`;
      const transactionOwner = transactions.get(transactionKey);
      const originalOwner = originals.get(originalKey);
      if (transactionOwner && transactionOwner !== userId) {
        throw new AppleTransactionOwnershipError("transaction owner mismatch");
      }
      if (originalOwner && originalOwner !== userId) {
        throw new AppleTransactionOwnershipError("original owner mismatch");
      }
      const created = !transactionOwner;
      transactions.set(transactionKey, userId);
      originals.set(originalKey, userId);
      return { created, aggregateUpdated: created };
    },
  };
}

test("verified token must match the authenticated user", async () => {
  const result = await synchronizeOwnedAppleTransaction({
    authenticatedUserId: "user-a",
    transaction: transaction(),
    repository: repository(),
  });
  assert.equal(result.userId, "user-a");
  await assert.rejects(
    synchronizeOwnedAppleTransaction({
      authenticatedUserId: "user-b",
      transaction: transaction(),
      repository: repository(),
    }),
    /belongs to another/
  );
});

test("unknown and mismatched renewal tokens are rejected", async () => {
  await assert.rejects(
    synchronizeOwnedAppleTransaction({
      authenticatedUserId: "user-a",
      transaction: transaction({ appAccountToken: "33333333-3333-4333-8333-333333333333" }),
      repository: repository(),
    }),
    /not registered/
  );
  await assert.rejects(
    synchronizeOwnedAppleTransaction({
      authenticatedUserId: "user-a",
      transaction: transaction(),
      renewalInfo: {
        environment: "PRODUCTION",
        originalTransactionId: "100000000001",
        productId: "com.petershikrenov.calistheni.pro.monthly",
        appAccountToken: tokenB,
        autoRenewStatus: true,
        gracePeriodExpiresDate: null,
        isInBillingRetryPeriod: false,
        signedDate: new Date(),
      },
      repository: repository(),
    }),
    /does not match/
  );
});

test("transaction and original-chain ownership cannot move users", async () => {
  const store = repository();
  await synchronizeOwnedAppleTransaction({
    authenticatedUserId: "user-a",
    transaction: transaction(),
    repository: store,
  });
  await assert.rejects(
    synchronizeOwnedAppleTransaction({
      authenticatedUserId: "user-b",
      transaction: transaction({ appAccountToken: tokenB }),
      repository: store,
    })
  );
  await assert.rejects(
    synchronizeOwnedAppleTransaction({
      authenticatedUserId: "user-b",
      transaction: transaction({
        transactionId: "200000000002",
        appAccountToken: tokenB,
      }),
      repository: store,
    })
  );
});

test("duplicate transaction synchronization is idempotent", async () => {
  const store = repository();
  const first = await synchronizeOwnedAppleTransaction({
    authenticatedUserId: "user-a",
    transaction: transaction(),
    repository: store,
  });
  const duplicate = await synchronizeOwnedAppleTransaction({
    authenticatedUserId: "user-a",
    transaction: transaction(),
    repository: store,
  });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
});
