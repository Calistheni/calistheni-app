import "server-only";

import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";
import {
  getAppleVerificationConfiguration,
  type AppleEnvironmentVariables,
  type AppleRuntimeEnvironment,
} from "@/lib/apple-iap/config";
import { getAppleRootCertificates } from "@/lib/apple-iap/root-certificates";
import {
  AppleVerificationError,
  appleDateFromMilliseconds,
  getSignedPayloadEnvironmentHint,
  hashApplePayload,
  requireAppleString,
  toRuntimeEnvironment,
  validateVerifiedAppleRenewalInfo,
  validateVerifiedAppleTransaction,
  verifyAppleTransactionWithBoundary,
} from "@/lib/apple-iap/verification-core";
import type {
  AppleSignedDataVerifierBoundary,
  AppleVerifiedNotification,
} from "@/lib/apple-iap/verification-types";

export { AppleVerificationError } from "@/lib/apple-iap/verification-core";

const verifierCache = new Map<
  AppleRuntimeEnvironment,
  AppleSignedDataVerifierBoundary
>();

function toLibraryEnvironment(environment: AppleRuntimeEnvironment) {
  return environment === "PRODUCTION"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

export function getAppleSignedDataVerifier(
  environment: AppleRuntimeEnvironment
) {
  const cached = verifierCache.get(environment);
  if (cached) return cached;

  const configuration = getAppleVerificationConfiguration(environment);
  const verifier = new SignedDataVerifier(
    getAppleRootCertificates(),
    true,
    toLibraryEnvironment(environment),
    configuration.bundleId,
    configuration.appAppleId
  );
  verifierCache.set(environment, verifier);
  return verifier;
}

export async function verifyAppleTransaction(
  signedTransaction: string,
  options: {
    expectedEnvironment?: AppleRuntimeEnvironment;
    getVerifier?: (
      environment: AppleRuntimeEnvironment
    ) => AppleSignedDataVerifierBoundary;
    environmentVariables?: AppleEnvironmentVariables;
  } = {}
) {
  return verifyAppleTransactionWithBoundary(signedTransaction, {
    expectedEnvironment: options.expectedEnvironment,
    getVerifier: options.getVerifier ?? getAppleSignedDataVerifier,
    environmentVariables: options.environmentVariables,
  });
}

export async function verifyAppleNotification(
  signedPayload: string,
  options: {
    getVerifier?: (
      environment: AppleRuntimeEnvironment
    ) => AppleSignedDataVerifierBoundary;
    environmentVariables?: AppleEnvironmentVariables;
  } = {}
): Promise<AppleVerifiedNotification> {
  const selectedEnvironment = getSignedPayloadEnvironmentHint(
    signedPayload,
    "notification"
  );
  const verifier = (options.getVerifier ?? getAppleSignedDataVerifier)(
    selectedEnvironment
  );
  let decoded;
  try {
    decoded = await verifier.verifyAndDecodeNotification(signedPayload);
  } catch {
    throw new AppleVerificationError(
      "Apple notification signature verification failed."
    );
  }
  const notificationUUID = requireAppleString(
    decoded.notificationUUID,
    "notification UUID"
  );
  const notificationType = requireAppleString(
    decoded.notificationType,
    "notification type"
  );
  const dataEnvironment = toRuntimeEnvironment(decoded.data?.environment);
  if (dataEnvironment !== selectedEnvironment) {
    throw new AppleVerificationError(
      "Verified Apple notification environment is inconsistent."
    );
  }

  const configuration = getAppleVerificationConfiguration(
    selectedEnvironment,
    options.environmentVariables
  );
  if (decoded.data?.bundleId !== configuration.bundleId) {
    throw new AppleVerificationError(
      "Verified Apple notification bundle ID is not allowed."
    );
  }
  if (
    selectedEnvironment === "PRODUCTION" &&
    decoded.data?.appAppleId !== configuration.appAppleId
  ) {
    throw new AppleVerificationError(
      "Verified Apple notification app Apple ID is not allowed."
    );
  }

  let transaction = null;
  let renewalInfo = null;
  try {
    transaction = decoded.data?.signedTransactionInfo
      ? validateVerifiedAppleTransaction(
          await verifier.verifyAndDecodeTransaction(
            decoded.data.signedTransactionInfo
          ),
          decoded.data.signedTransactionInfo,
          selectedEnvironment,
          options.environmentVariables
        )
      : null;
    renewalInfo = decoded.data?.signedRenewalInfo
      ? validateVerifiedAppleRenewalInfo(
          await verifier.verifyAndDecodeRenewalInfo(
            decoded.data.signedRenewalInfo
          ),
          selectedEnvironment,
          options.environmentVariables
        )
      : null;
  } catch (error) {
    if (error instanceof AppleVerificationError) throw error;
    throw new AppleVerificationError(
      "Apple notification child signature verification failed."
    );
  }

  if (
    transaction &&
    renewalInfo &&
    transaction.originalTransactionId !== renewalInfo.originalTransactionId
  ) {
    throw new AppleVerificationError(
      "Verified Apple transaction and renewal information do not match."
    );
  }

  return {
    environment: selectedEnvironment,
    notificationUUID,
    notificationType,
    subtype: typeof decoded.subtype === "string" ? decoded.subtype : null,
    signedDate: appleDateFromMilliseconds(
      decoded.signedDate,
      "notification signed date"
    ),
    payloadHash: hashApplePayload(signedPayload),
    status: typeof decoded.data?.status === "number" ? decoded.data.status : null,
    transaction,
    renewalInfo,
  };
}
