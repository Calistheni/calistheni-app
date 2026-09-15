import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import type { AppleProductKindValue } from "@/lib/apple-iap/products";
import type { AppleRuntimeEnvironment } from "@/lib/apple-iap/config-core";
import type { AppleEnvironmentVariables } from "@/lib/apple-iap/config-core";

export type AppleVerifiedTransaction = {
  environment: AppleRuntimeEnvironment;
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  productKind: AppleProductKindValue;
  appAccountToken: string;
  purchaseDate: Date;
  expiresDate: Date | null;
  revocationDate: Date | null;
  ownershipType: "PURCHASED" | "FAMILY_SHARED";
  signedDate: Date;
  payloadHash: string;
};

export type AppleVerifiedRenewalInfo = {
  environment: AppleRuntimeEnvironment;
  originalTransactionId: string;
  productId: string;
  appAccountToken: string | null;
  autoRenewStatus: boolean | null;
  gracePeriodExpiresDate: Date | null;
  isInBillingRetryPeriod: boolean;
  signedDate: Date;
};

export type AppleVerifiedNotification = {
  environment: AppleRuntimeEnvironment;
  notificationUUID: string;
  notificationType: string;
  subtype: string | null;
  signedDate: Date;
  payloadHash: string;
  status: number | null;
  transaction: AppleVerifiedTransaction | null;
  renewalInfo: AppleVerifiedRenewalInfo | null;
};

export type AppleSignedDataVerifierBoundary = {
  verifyAndDecodeTransaction(
    signedTransaction: string
  ): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeRenewalInfo(
    signedRenewalInfo: string
  ): Promise<JWSRenewalInfoDecodedPayload>;
  verifyAndDecodeNotification(
    signedPayload: string
  ): Promise<ResponseBodyV2DecodedPayload>;
};

export type AppleVerificationOptions = {
  expectedEnvironment?: AppleRuntimeEnvironment;
  getVerifier: (
    environment: AppleRuntimeEnvironment
  ) => AppleSignedDataVerifierBoundary;
  environmentVariables?: AppleEnvironmentVariables;
};
