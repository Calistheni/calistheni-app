import type {
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "@/lib/apple-iap/verification-types";

export const APPLE_SUBSCRIPTION_STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,
  BILLING_GRACE_PERIOD: 4,
  REVOKED: 5,
} as const;

export type ApplePurchaseSnapshot = {
  environment: "PRODUCTION" | "SANDBOX";
  originalTransactionId: string;
  latestTransactionId: string;
  productId: string;
  productKind: "SUBSCRIPTION" | "LIFETIME";
  state:
    | "ACTIVE"
    | "GRACE_PERIOD"
    | "BILLING_RETRY"
    | "EXPIRED"
    | "REVOKED";
  purchasedAt: Date;
  expiresAt: Date | null;
  gracePeriodExpiresAt: Date | null;
  autoRenewStatus: boolean | null;
  revokedAt: Date | null;
  latestSignedDate: Date;
  lastVerifiedAt: Date;
};

export function shouldApplyAppleAggregateUpdate(
  existingSignedDate: Date,
  candidateSignedDate: Date
) {
  return existingSignedDate.getTime() <= candidateSignedDate.getTime();
}

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates.reduce<Date | null>(
    (latest, date) =>
      date && (!latest || date.getTime() > latest.getTime()) ? date : latest,
    null
  );
}

export function deriveApplePurchaseSnapshot({
  transaction,
  renewalInfo = null,
  subscriptionStatus = null,
  sourceSignedDate = null,
  now = new Date(),
}: {
  transaction: AppleVerifiedTransaction;
  renewalInfo?: AppleVerifiedRenewalInfo | null;
  subscriptionStatus?: number | null;
  sourceSignedDate?: Date | null;
  now?: Date;
}): ApplePurchaseSnapshot {
  const gracePeriodExpiresAt = renewalInfo?.gracePeriodExpiresDate ?? null;
  const isRevoked =
    Boolean(transaction.revocationDate) ||
    subscriptionStatus === APPLE_SUBSCRIPTION_STATUS.REVOKED;
  let state: ApplePurchaseSnapshot["state"];

  if (isRevoked) {
    state = "REVOKED";
  } else if (transaction.productKind === "LIFETIME") {
    state = "ACTIVE";
  } else if (
    transaction.expiresDate &&
    transaction.expiresDate.getTime() > now.getTime()
  ) {
    state = "ACTIVE";
  } else if (
    subscriptionStatus === APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE_PERIOD &&
    gracePeriodExpiresAt &&
    gracePeriodExpiresAt.getTime() > now.getTime()
  ) {
    state = "GRACE_PERIOD";
  } else if (
    subscriptionStatus === APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY ||
    renewalInfo?.isInBillingRetryPeriod
  ) {
    state = "BILLING_RETRY";
  } else {
    state = "EXPIRED";
  }

  return {
    environment: transaction.environment,
    originalTransactionId: transaction.originalTransactionId,
    latestTransactionId: transaction.transactionId,
    productId: transaction.productId,
    productKind: transaction.productKind,
    state,
    purchasedAt: transaction.purchaseDate,
    expiresAt: transaction.expiresDate,
    gracePeriodExpiresAt,
    autoRenewStatus: renewalInfo?.autoRenewStatus ?? null,
    revokedAt: transaction.revocationDate,
    latestSignedDate:
      latestDate(
        transaction.signedDate,
        renewalInfo?.signedDate,
        sourceSignedDate
      ) ?? transaction.signedDate,
    lastVerifiedAt: now,
  };
}

export function deriveApplePurchaseSnapshotFromStored({
  purchase,
  renewalInfo,
  subscriptionStatus = null,
  sourceSignedDate = null,
  now = new Date(),
}: {
  purchase: Omit<ApplePurchaseSnapshot, "state" | "lastVerifiedAt"> & {
    state: ApplePurchaseSnapshot["state"];
  };
  renewalInfo: AppleVerifiedRenewalInfo;
  subscriptionStatus?: number | null;
  sourceSignedDate?: Date | null;
  now?: Date;
}): ApplePurchaseSnapshot {
  const transaction: AppleVerifiedTransaction = {
    environment: purchase.environment,
    transactionId: purchase.latestTransactionId,
    originalTransactionId: purchase.originalTransactionId,
    bundleId: "",
    productId: purchase.productId,
    productKind: purchase.productKind,
    appAccountToken: "",
    purchaseDate: purchase.purchasedAt,
    expiresDate: purchase.expiresAt,
    revocationDate: purchase.revokedAt,
    ownershipType: "PURCHASED",
    signedDate: purchase.latestSignedDate,
    payloadHash: "",
  };
  return deriveApplePurchaseSnapshot({
    transaction,
    renewalInfo,
    subscriptionStatus,
    sourceSignedDate,
    now,
  });
}
