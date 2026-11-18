import type {
  StatusResponse,
  TransactionInfoResponse,
} from "@apple/app-store-server-library";
import {
  getAppleVerificationConfiguration,
  type AppleEnvironmentVariables,
  type AppleRuntimeEnvironment,
} from "@/lib/apple-iap/config-core";
import { AppleVerificationError } from "@/lib/apple-iap/verification-core";
import type {
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "@/lib/apple-iap/verification-types";

export type AppleServerApiBoundary = {
  getAllSubscriptionStatuses(transactionId: string): Promise<StatusResponse>;
  getTransactionInfo(transactionId: string): Promise<TransactionInfoResponse>;
};

export type AppleAuthoritativeTransactionState = {
  transaction: AppleVerifiedTransaction;
  renewalInfo: AppleVerifiedRenewalInfo | null;
  subscriptionStatus: number | null;
  sourceSignedDate: Date;
};

type TransactionVerifier = (
  value: string,
  environment: AppleRuntimeEnvironment
) => Promise<AppleVerifiedTransaction>;
type RenewalVerifier = (
  value: string,
  environment: AppleRuntimeEnvironment
) => Promise<AppleVerifiedRenewalInfo>;

function requireResponseIdentity(
  response: StatusResponse,
  environment: AppleRuntimeEnvironment,
  environmentVariables: AppleEnvironmentVariables
) {
  const configuration = getAppleVerificationConfiguration(
    environment,
    environmentVariables
  );
  if (
    response.environment !==
    (environment === "PRODUCTION" ? "Production" : "Sandbox")
  ) {
    throw new AppleVerificationError(
      "App Store Server API returned the wrong environment."
    );
  }
  if (response.bundleId !== configuration.bundleId) {
    throw new AppleVerificationError(
      "App Store Server API returned the wrong bundle ID."
    );
  }
  if (
    environment === "PRODUCTION" &&
    response.appAppleId !== configuration.appAppleId
  ) {
    throw new AppleVerificationError(
      "App Store Server API returned the wrong app Apple ID."
    );
  }
}

function requireSamePurchaseIdentity(
  submitted: AppleVerifiedTransaction,
  authoritative: AppleVerifiedTransaction
) {
  if (
    authoritative.environment !== submitted.environment ||
    authoritative.originalTransactionId !== submitted.originalTransactionId ||
    authoritative.appAccountToken !== submitted.appAccountToken ||
    authoritative.productKind !== submitted.productKind
  ) {
    throw new AppleVerificationError(
      "App Store Server API transaction identity does not match the submitted purchase."
    );
  }
}

export async function getAuthoritativeAppleTransactionStateWithBoundary(
  submitted: AppleVerifiedTransaction,
  options: {
    client: AppleServerApiBoundary;
    verifyTransaction: TransactionVerifier;
    verifyRenewalInfo: RenewalVerifier;
    environmentVariables?: AppleEnvironmentVariables;
  }
): Promise<AppleAuthoritativeTransactionState> {
  if (submitted.productKind === "LIFETIME") {
    const response = await options.client.getTransactionInfo(
      submitted.transactionId
    );
    if (!response.signedTransactionInfo) {
      throw new AppleVerificationError(
        "App Store Server API omitted transaction information."
      );
    }
    const transaction = await options.verifyTransaction(
      response.signedTransactionInfo,
      submitted.environment
    );
    requireSamePurchaseIdentity(submitted, transaction);
    if (transaction.transactionId !== submitted.transactionId) {
      throw new AppleVerificationError(
        "App Store Server API returned a different transaction."
      );
    }
    return {
      transaction,
      renewalInfo: null,
      subscriptionStatus: null,
      sourceSignedDate: transaction.signedDate,
    };
  }

  const response = await options.client.getAllSubscriptionStatuses(
    submitted.originalTransactionId
  );
  requireResponseIdentity(
    response,
    submitted.environment,
    options.environmentVariables ?? process.env
  );
  const candidate = (response.data ?? [])
    .flatMap((group) => group.lastTransactions ?? [])
    .find(
      (item) => item.originalTransactionId === submitted.originalTransactionId
    );
  if (!candidate?.signedTransactionInfo) {
    throw new AppleVerificationError(
      "App Store Server API did not return the subscription chain."
    );
  }

  const transaction = await options.verifyTransaction(
    candidate.signedTransactionInfo,
    submitted.environment
  );
  requireSamePurchaseIdentity(submitted, transaction);
  const renewalInfo = candidate.signedRenewalInfo
    ? await options.verifyRenewalInfo(
        candidate.signedRenewalInfo,
        submitted.environment
      )
    : null;
  if (
    renewalInfo &&
    renewalInfo.originalTransactionId !== transaction.originalTransactionId
  ) {
    throw new AppleVerificationError(
      "App Store Server API renewal information does not match the transaction."
    );
  }
  return {
    transaction,
    renewalInfo,
    subscriptionStatus:
      typeof candidate.status === "number" ? candidate.status : null,
    sourceSignedDate:
      renewalInfo && renewalInfo.signedDate > transaction.signedDate
        ? renewalInfo.signedDate
        : transaction.signedDate,
  };
}
