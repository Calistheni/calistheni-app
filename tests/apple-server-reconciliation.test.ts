import assert from "node:assert/strict";
import test from "node:test";
import { Environment, Status } from "@apple/app-store-server-library";
import { getAuthoritativeAppleTransactionStateWithBoundary } from "../lib/apple-iap/reconciliation-core.ts";
import type {
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "../lib/apple-iap/verification-types.ts";

const accountToken = "11111111-1111-4111-8111-111111111111";

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
    appAccountToken: accountToken,
    purchaseDate: new Date("2026-11-01T00:00:00Z"),
    expiresDate: new Date("2026-12-01T00:00:00Z"),
    revocationDate: null,
    ownershipType: "PURCHASED",
    signedDate: new Date("2026-11-01T00:00:01Z"),
    payloadHash: "a".repeat(64),
    ...overrides,
  };
}

function renewal(
  overrides: Partial<AppleVerifiedRenewalInfo> = {}
): AppleVerifiedRenewalInfo {
  return {
    environment: "PRODUCTION",
    originalTransactionId: "100000000001",
    productId: "com.petershikrenov.calistheni.pro.monthly",
    appAccountToken: accountToken,
    autoRenewStatus: true,
    gracePeriodExpiresDate: null,
    isInBillingRetryPeriod: false,
    signedDate: new Date("2026-11-01T00:00:02Z"),
    ...overrides,
  };
}

const productionEnvironment = { APPLE_APP_ID: "1234567890" };

test("subscription synchronization uses current App Store Server API status", async () => {
  const submitted = transaction();
  const authoritative = transaction({
    transactionId: "200000000002",
    expiresDate: new Date("2027-01-01T00:00:00Z"),
    signedDate: new Date("2026-12-01T00:00:01Z"),
  });
  const currentRenewal = renewal({
    signedDate: new Date("2026-12-01T00:00:02Z"),
  });
  const calls: string[] = [];
  const result = await getAuthoritativeAppleTransactionStateWithBoundary(
    submitted,
    {
      environmentVariables: productionEnvironment,
      client: {
        getAllSubscriptionStatuses: async (transactionId) => {
          calls.push(transactionId);
          return {
            environment: Environment.PRODUCTION,
            bundleId: submitted.bundleId,
            appAppleId: 1234567890,
            data: [
              {
                lastTransactions: [
                  {
                    originalTransactionId: submitted.originalTransactionId,
                    status: Status.ACTIVE,
                    signedTransactionInfo: "server-transaction",
                    signedRenewalInfo: "server-renewal",
                  },
                ],
              },
            ],
          };
        },
        getTransactionInfo: async () => {
          throw new Error("not used");
        },
      },
      verifyTransaction: async (value, environment) => {
        assert.equal(value, "server-transaction");
        assert.equal(environment, "PRODUCTION");
        return authoritative;
      },
      verifyRenewalInfo: async (value, environment) => {
        assert.equal(value, "server-renewal");
        assert.equal(environment, "PRODUCTION");
        return currentRenewal;
      },
    }
  );
  assert.deepEqual(calls, [submitted.originalTransactionId]);
  assert.equal(result.transaction.transactionId, authoritative.transactionId);
  assert.equal(result.subscriptionStatus, Status.ACTIVE);
  assert.equal(result.renewalInfo?.autoRenewStatus, true);
  assert.equal(result.sourceSignedDate, currentRenewal.signedDate);
});

test("server status rejects wrong app identity and purchase ownership", async () => {
  const submitted = transaction();
  const baseClient = {
    getAllSubscriptionStatuses: async () => ({
      environment: Environment.PRODUCTION,
      bundleId: submitted.bundleId,
      appAppleId: 999,
      data: [],
    }),
    getTransactionInfo: async () => ({}),
  };
  await assert.rejects(
    getAuthoritativeAppleTransactionStateWithBoundary(submitted, {
      client: baseClient,
      environmentVariables: productionEnvironment,
      verifyTransaction: async () => submitted,
      verifyRenewalInfo: async () => renewal(),
    }),
    /wrong app Apple ID/
  );

  await assert.rejects(
    getAuthoritativeAppleTransactionStateWithBoundary(submitted, {
      client: {
        ...baseClient,
        getAllSubscriptionStatuses: async () => ({
          environment: Environment.PRODUCTION,
          bundleId: submitted.bundleId,
          appAppleId: 1234567890,
          data: [
            {
              lastTransactions: [
                {
                  originalTransactionId: submitted.originalTransactionId,
                  signedTransactionInfo: "server-transaction",
                },
              ],
            },
          ],
        }),
      },
      environmentVariables: productionEnvironment,
      verifyTransaction: async () =>
        transaction({
          appAccountToken: "22222222-2222-4222-8222-222222222222",
        }),
      verifyRenewalInfo: async () => renewal(),
    }),
    /identity does not match/
  );
});

test("a lifetime record is independently looked up and must match exactly", async () => {
  const submitted = transaction({
    productId: "com.petershikrenov.calistheni.pro.lifetime",
    productKind: "LIFETIME",
    expiresDate: null,
  });
  let lookedUp: string | null = null;
  const result = await getAuthoritativeAppleTransactionStateWithBoundary(
    submitted,
    {
      client: {
        getAllSubscriptionStatuses: async () => {
          throw new Error("not used");
        },
        getTransactionInfo: async (transactionId) => {
          lookedUp = transactionId;
          return { signedTransactionInfo: "server-transaction" };
        },
      },
      verifyTransaction: async () => submitted,
      verifyRenewalInfo: async () => renewal(),
    }
  );
  assert.equal(lookedUp, submitted.transactionId);
  assert.equal(result.transaction.productKind, "LIFETIME");
  assert.equal(result.renewalInfo, null);
});
