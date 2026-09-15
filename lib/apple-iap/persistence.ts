import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppleOwnershipRepository } from "@/lib/apple-iap/ownership";
import { AppleTransactionOwnershipError } from "@/lib/apple-iap/ownership";
import {
  deriveApplePurchaseSnapshot,
  deriveApplePurchaseSnapshotFromStored,
  shouldApplyAppleAggregateUpdate,
} from "@/lib/apple-iap/state";
import type { AppleVerifiedRenewalInfo } from "@/lib/apple-iap/verification-types";

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Apple transaction persistence retry exhausted.");
}

export const appleOwnershipRepository: AppleOwnershipRepository = {
  async findUserIdByAppAccountToken(token) {
    const account = await prisma.appleBillingAccount.findUnique({
      where: { appAccountToken: token },
      select: { userId: true },
    });
    return account?.userId ?? null;
  },

  persistTransaction(input) {
    return withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const { transaction, userId } = input;
          const [existingTransaction, existingPurchase] = await Promise.all([
            tx.appleTransaction.findUnique({
              where: {
                environment_transactionId: {
                  environment: transaction.environment,
                  transactionId: transaction.transactionId,
                },
              },
            }),
            tx.applePurchase.findUnique({
              where: {
                environment_originalTransactionId: {
                  environment: transaction.environment,
                  originalTransactionId: transaction.originalTransactionId,
                },
              },
            }),
          ]);

          if (existingTransaction && existingTransaction.userId !== userId) {
            throw new AppleTransactionOwnershipError(
              "Apple transaction is already associated with another user."
            );
          }
          if (
            existingTransaction &&
            (existingTransaction.originalTransactionId !==
              transaction.originalTransactionId ||
              existingTransaction.productId !== transaction.productId ||
              existingTransaction.appAccountToken !==
                transaction.appAccountToken)
          ) {
            throw new AppleTransactionOwnershipError(
              "Apple transaction identity conflicts with its immutable history."
            );
          }
          if (existingPurchase && existingPurchase.userId !== userId) {
            throw new AppleTransactionOwnershipError(
              "Apple original transaction is already associated with another user."
            );
          }

          if (!existingTransaction) {
            await tx.appleTransaction.create({
              data: {
                userId,
                environment: transaction.environment,
                transactionId: transaction.transactionId,
                originalTransactionId: transaction.originalTransactionId,
                productId: transaction.productId,
                productKind: transaction.productKind,
                appAccountToken: transaction.appAccountToken,
                purchaseDate: transaction.purchaseDate,
                expiresDate: transaction.expiresDate,
                revocationDate: transaction.revocationDate,
                ownershipType: transaction.ownershipType,
                signedDate: transaction.signedDate,
                payloadHash: transaction.payloadHash,
              },
            });
          }

          const snapshot = deriveApplePurchaseSnapshot(input);
          let aggregateUpdated = false;
          if (!existingPurchase) {
            await tx.applePurchase.create({ data: { userId, ...snapshot } });
            aggregateUpdated = true;
          } else if (
            shouldApplyAppleAggregateUpdate(
              existingPurchase.latestSignedDate,
              snapshot.latestSignedDate
            )
          ) {
            const update = await tx.applePurchase.updateMany({
              where: {
                id: existingPurchase.id,
                latestSignedDate: { lte: snapshot.latestSignedDate },
              },
              data: snapshot,
            });
            aggregateUpdated = update.count === 1;
          }

          return { created: !existingTransaction, aggregateUpdated };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
  },
};

export async function applyVerifiedAppleRenewalInfo({
  renewalInfo,
  subscriptionStatus,
  sourceSignedDate,
  now = new Date(),
}: {
  renewalInfo: AppleVerifiedRenewalInfo;
  subscriptionStatus: number | null;
  sourceSignedDate: Date;
  now?: Date;
}) {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const purchase = await tx.applePurchase.findUnique({
          where: {
            environment_originalTransactionId: {
              environment: renewalInfo.environment,
              originalTransactionId: renewalInfo.originalTransactionId,
            },
          },
        });
        if (!purchase) return { found: false, updated: false };

        if (renewalInfo.appAccountToken) {
          const account = await tx.appleBillingAccount.findUnique({
            where: { appAccountToken: renewalInfo.appAccountToken },
            select: { userId: true },
          });
          if (!account || account.userId !== purchase.userId) {
            throw new AppleTransactionOwnershipError(
              "Apple renewal information belongs to another user."
            );
          }
        }

        const snapshot = deriveApplePurchaseSnapshotFromStored({
          purchase,
          renewalInfo,
          subscriptionStatus,
          sourceSignedDate,
          now,
        });
        if (
          !shouldApplyAppleAggregateUpdate(
            purchase.latestSignedDate,
            snapshot.latestSignedDate
          )
        ) {
          return { found: true, updated: false };
        }
        const updated = await tx.applePurchase.updateMany({
          where: {
            id: purchase.id,
            latestSignedDate: { lte: snapshot.latestSignedDate },
          },
          data: snapshot,
        });
        return { found: true, updated: updated.count === 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}
