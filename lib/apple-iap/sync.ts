import "server-only";

import { appleOwnershipRepository } from "@/lib/apple-iap/persistence";
import {
  AppleTransactionOwnershipError,
  synchronizeOwnedAppleTransaction,
} from "@/lib/apple-iap/ownership";
import { verifyAppleTransaction } from "@/lib/apple-iap/verification";
import {
  getAuthoritativeAppleTransactionState,
  type AppleAuthoritativeTransactionState,
} from "@/lib/apple-iap/reconciliation";

export const MAX_APPLE_TRANSACTION_SYNC_BATCH = 50;
export const MAX_APPLE_SIGNED_PAYLOAD_LENGTH = 256_000;

export class AppleTransactionSyncInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleTransactionSyncInputError";
  }
}

export function parseAppleTransactionSyncInput(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new AppleTransactionSyncInputError("Invalid transaction sync payload.");
  }
  const signedTransactions = (body as { signedTransactions?: unknown })
    .signedTransactions;
  if (
    !Array.isArray(signedTransactions) ||
    signedTransactions.length === 0 ||
    signedTransactions.length > MAX_APPLE_TRANSACTION_SYNC_BATCH ||
    signedTransactions.some(
      (value) =>
        typeof value !== "string" ||
        value.length < 20 ||
        value.length > MAX_APPLE_SIGNED_PAYLOAD_LENGTH
    )
  ) {
    throw new AppleTransactionSyncInputError(
      "signedTransactions must contain between 1 and 50 signed Apple transactions."
    );
  }
  return signedTransactions as string[];
}

export async function synchronizeAppleTransactionJwsBatch({
  userId,
  signedTransactions,
  getAuthoritativeState = getAuthoritativeAppleTransactionState,
}: {
  userId: string;
  signedTransactions: string[];
  getAuthoritativeState?: (
    transaction: Awaited<ReturnType<typeof verifyAppleTransaction>>
  ) => Promise<AppleAuthoritativeTransactionState>;
}) {
  // Verify the complete batch before persisting any item. A malformed or
  // foreign item cannot produce a partially accepted restore response.
  const transactions = await Promise.all(
    signedTransactions.map((signedTransaction) =>
      verifyAppleTransaction(signedTransaction)
    )
  );
  // Reject a foreign account token before making an App Store Server API call
  // or persisting any member of a restore batch.
  for (const transaction of transactions) {
    const ownerUserId = await appleOwnershipRepository.findUserIdByAppAccountToken(
      transaction.appAccountToken,
      transaction.environment
    );
    if (ownerUserId !== userId) {
      throw new AppleTransactionOwnershipError(
        "Verified Apple transaction belongs to another Calistheni account."
      );
    }
  }
  const authoritativeStates = await Promise.all(
    transactions.map((transaction) => getAuthoritativeState(transaction))
  );
  const results = [];
  for (const state of authoritativeStates) {
    results.push(
      await synchronizeOwnedAppleTransaction({
        authenticatedUserId: userId,
        transaction: state.transaction,
        renewalInfo: state.renewalInfo,
        subscriptionStatus: state.subscriptionStatus,
        sourceSignedDate: state.sourceSignedDate,
        repository: appleOwnershipRepository,
      })
    );
  }
  return {
    transactions: authoritativeStates.map((state) => state.transaction),
    results,
  };
}
