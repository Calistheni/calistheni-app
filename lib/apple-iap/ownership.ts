import type {
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "@/lib/apple-iap/verification-types";

export class AppleTransactionOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleTransactionOwnershipError";
  }
}

export type AppleOwnershipRepository = {
  findUserIdByAppAccountToken(token: string): Promise<string | null>;
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
    transaction.appAccountToken
  );
  if (!ownerUserId) {
    throw new AppleTransactionOwnershipError(
      "Verified Apple app account token is not registered."
    );
  }
  if (authenticatedUserId && ownerUserId !== authenticatedUserId) {
    throw new AppleTransactionOwnershipError(
      "Verified Apple transaction belongs to another Calistheni account."
    );
  }
  if (
    renewalInfo?.appAccountToken &&
    renewalInfo.appAccountToken !== transaction.appAccountToken
  ) {
    throw new AppleTransactionOwnershipError(
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
