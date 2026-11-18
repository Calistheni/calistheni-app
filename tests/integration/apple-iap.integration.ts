import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { databaseUrl, safeLocalDatabase } from "./test-database.ts";

test(
  "Apple purchase persistence is idempotent, ownership-safe, and coexists with Stripe",
  { skip: !safeLocalDatabase },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { prisma },
      { appleOwnershipRepository },
      { AppleTransactionOwnershipError, synchronizeOwnedAppleTransaction },
      { getUserEntitlements },
    ] = await Promise.all([
      import("../../lib/prisma.ts"),
      import("../../lib/apple-iap/persistence.ts"),
      import("../../lib/apple-iap/ownership.ts"),
      import("../../lib/entitlements.ts"),
    ]);

    const marker = `${Date.now()}-${randomUUID()}`;
    const tokenA = randomUUID();
    const tokenB = randomUUID();
    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Apple purchaser",
          email: `apple-a-${marker}@example.test`,
          appleBillingAccount: { create: { appAccountToken: tokenA } },
        },
      }),
      prisma.user.create({
        data: {
          name: "Other account",
          email: `apple-b-${marker}@example.test`,
          appleBillingAccount: { create: { appAccountToken: tokenB } },
        },
      }),
    ]);
    const now = new Date();
    const verifiedTransaction = {
      environment: "PRODUCTION" as const,
      transactionId: `tx-${marker}`,
      originalTransactionId: `original-${marker}`,
      bundleId: "com.petershikrenov.calistheni",
      productId: "com.petershikrenov.calistheni.pro.monthly",
      productKind: "SUBSCRIPTION" as const,
      appAccountToken: tokenA,
      purchaseDate: now,
      expiresDate: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      revocationDate: null,
      ownershipType: "PURCHASED" as const,
      signedDate: new Date(now.getTime() + 1_000),
      payloadHash: "a".repeat(64),
    };

    try {
      const first = await synchronizeOwnedAppleTransaction({
        authenticatedUserId: userA.id,
        transaction: verifiedTransaction,
        repository: appleOwnershipRepository,
      });
      const duplicate = await synchronizeOwnedAppleTransaction({
        authenticatedUserId: userA.id,
        transaction: verifiedTransaction,
        repository: appleOwnershipRepository,
      });
      assert.equal(first.created, true);
      assert.equal(duplicate.created, false);
      assert.equal(
        await prisma.appleTransaction.count({
          where: { originalTransactionId: verifiedTransaction.originalTransactionId },
        }),
        1
      );
      assert.equal(
        await prisma.applePurchase.count({
          where: { originalTransactionId: verifiedTransaction.originalTransactionId },
        }),
        1
      );
      assert.equal((await getUserEntitlements(userA.id)).entitlements.isPro, true);

      await assert.rejects(
        synchronizeOwnedAppleTransaction({
          authenticatedUserId: userB.id,
          transaction: {
            ...verifiedTransaction,
            transactionId: `tx-other-${marker}`,
            appAccountToken: tokenB,
            signedDate: new Date(now.getTime() + 2_000),
          },
          repository: appleOwnershipRepository,
        }),
        AppleTransactionOwnershipError
      );

      await prisma.subscription.create({
        data: {
          userId: userA.id,
          plan: "PRO_MONTHLY",
          status: "ACTIVE",
          stripeCustomerId: `cus_${marker}`,
          stripeSubscriptionId: `sub_${marker}`,
        },
      });
      await prisma.applePurchase.updateMany({
        where: { userId: userA.id },
        data: { state: "REVOKED", revokedAt: new Date(now.getTime() + 3_000) },
      });
      const coexisting = await getUserEntitlements(userA.id);
      assert.equal(coexisting.entitlements.isPro, true);
      assert.deepEqual(
        coexisting.grants.map((grant) => grant.provider),
        ["STRIPE"]
      );
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
      await prisma.$disconnect();
    }
  }
);
