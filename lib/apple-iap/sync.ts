import "server-only";

import { appleOwnershipRepository } from "@/lib/apple-iap/persistence";
import { synchronizeOwnedAppleTransaction } from "@/lib/apple-iap/ownership";
import { verifyAppleTransaction } from "@/lib/apple-iap/verification";

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
}: {
  userId: string;
  signedTransactions: string[];
}) {
  // Verify the complete batch before persisting any item. A malformed or
  // foreign item cannot produce a partially accepted restore response.
  const transactions = await Promise.all(
    signedTransactions.map((signedTransaction) =>
      verifyAppleTransaction(signedTransaction)
    )
  );
  const results = [];
  for (const transaction of transactions) {
    results.push(
      await synchronizeOwnedAppleTransaction({
        authenticatedUserId: userId,
        transaction,
        repository: appleOwnershipRepository,
      })
    );
  }
  return { transactions, results };
}
