import type {
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "@/lib/apple-iap/verification-types";

type AppleOwnershipFailureReason =
  | "unregistered_account_token"
  | "signed_in_account_mismatch"
  | "renewal_token_mismatch"
  | "transaction_owner_mismatch"
  | "transaction_identity_conflict"
  | "purchase_chain_owner_mismatch"
  | "renewal_owner_mismatch";

export class AppleTransactionOwnershipError extends Error {
  constructor(readonly reason: AppleOwnershipFailureReason, message: string) {
    super(message);
    this.name = "AppleTransactionOwnershipError";
  }
}

export type AppleOwnershipRepository = {
  findUserIdByAppAccountToken(token: string, environment: AppleVerifiedTransaction["environment"]): Promise<string | null>;
  persistTransaction(input: {
    userId: string;
    transaction: AppleVerifiedTransaction;
    renewalInfo: AppleVerifiedRenewalInfo | null;
    subscriptionStatus: number | null;
    sourceSignedDate: Date | null;
    now: Date;
  }): Promise<{ created: boolean; aggregateUpdated: boolean }>;
};

export async function synchronizeOwnedAppleTransaction({
  authenticatedUserId,
  transaction,
  renewalInfo = null,
  subscriptionStatus = null,
  sourceSignedDate = null,
  now = new Date(),
  repository,
}: {
  authenticatedUserId?: string | null;
  transaction: AppleVerifiedTransaction;
  renewalInfo?: AppleVerifiedRenewalInfo | null;
  subscriptionStatus?: number | null;
  sourceSignedDate?: Date | null;
  now?: Date;
  repository: AppleOwnershipRepository;
}) {
  const ownerUserId = await repository.findUserIdByAppAccountToken(
    transaction.appAccountToken,
    transaction.environment
  );
  if (!ownerUserId) {
    throw new AppleTransactionOwnershipError(
      "unregistered_account_token",
      "Verified Apple app account token is not registered."
    );
  }
  if (authenticatedUserId && ownerUserId !== authenticatedUserId) {
    throw new AppleTransactionOwnershipError(
      "signed_in_account_mismatch",
      "Verified Apple transaction belongs to another Calistheni account."
    );
  }
  if (
    renewalInfo?.appAccountToken &&
    renewalInfo.appAccountToken !== transaction.appAccountToken
  ) {
    throw new AppleTransactionOwnershipError(
      "renewal_token_mismatch",
      "Verified Apple renewal account token does not match the transaction."
    );
  }

  const result = await repository.persistTransaction({
    userId: ownerUserId,
    transaction,
    renewalInfo,
    subscriptionStatus,
    sourceSignedDate,
    now,
  });
  return { ...result, userId: ownerUserId };
}
