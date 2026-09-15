import { createHash } from "node:crypto";
import {
  AutoRenewStatus,
  Environment,
  InAppOwnershipType,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import {
  getApplePublicConfiguration,
  type AppleEnvironmentVariables,
  type AppleRuntimeEnvironment,
} from "@/lib/apple-iap/config-core";
import { getAppleProductKind } from "@/lib/apple-iap/products";
import type {
  AppleSignedDataVerifierBoundary,
  AppleVerifiedRenewalInfo,
  AppleVerifiedTransaction,
} from "@/lib/apple-iap/verification-types";

export class AppleVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleVerificationError";
  }
}

export function toRuntimeEnvironment(
  value: unknown
): AppleRuntimeEnvironment | null {
  if (value === Environment.PRODUCTION || value === "Production") {
    return "PRODUCTION";
  }
  if (value === Environment.SANDBOX || value === "Sandbox") return "SANDBOX";
  return null;
}

export function requireAppleString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppleVerificationError(`Verified Apple ${field} is missing.`);
  }
  return value;
}

export function appleDateFromMilliseconds(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AppleVerificationError(`Verified Apple ${field} is invalid.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppleVerificationError(`Verified Apple ${field} is invalid.`);
  }
  return date;
}

function optionalDateFromMilliseconds(value: unknown, field: string) {
  return value == null ? null : appleDateFromMilliseconds(value, field);
}

export function hashApplePayload(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeSignedPayloadBody(signedPayload: string): unknown {
  const parts = signedPayload.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new AppleVerificationError("Apple signed payload is malformed.");
  }
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new AppleVerificationError("Apple signed payload body is malformed.");
  }
}

/**
 * Reads only the untrusted signed-payload claim needed to choose one explicit
 * verifier. The selected verifier must authenticate that same environment.
 */
export function getSignedPayloadEnvironmentHint(
  signedPayload: string,
  kind: "transaction" | "notification" | "renewal"
) {
  const decoded = decodeSignedPayloadBody(signedPayload) as {
    environment?: unknown;
    data?: { environment?: unknown };
  };
  const value =
    kind === "notification" ? decoded.data?.environment : decoded.environment;
  const environment = toRuntimeEnvironment(value);
  if (!environment) {
    throw new AppleVerificationError(
      "Apple signed payload does not declare a supported environment."
    );
  }
  return environment;
}

function requireUuid(value: unknown, field: string) {
  const token = requireAppleString(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token
    )
  ) {
    throw new AppleVerificationError(`Verified Apple ${field} is not a UUID.`);
  }
  return token.toLowerCase();
}

export function validateVerifiedAppleTransaction(
  decoded: JWSTransactionDecodedPayload,
  signedTransaction: string,
  expectedEnvironment: AppleRuntimeEnvironment,
  environmentVariables: AppleEnvironmentVariables = process.env
): AppleVerifiedTransaction {
  const configuration = getApplePublicConfiguration(environmentVariables);
  const environment = toRuntimeEnvironment(decoded.environment);
  if (environment !== expectedEnvironment) {
    throw new AppleVerificationError(
      "Verified Apple transaction environment does not match the selected verifier."
    );
  }

  const bundleId = requireAppleString(decoded.bundleId, "bundle ID");
  if (bundleId !== configuration.bundleId) {
    throw new AppleVerificationError("Verified Apple bundle ID is not allowed.");
  }

  const productId = requireAppleString(decoded.productId, "product ID");
  const productKind = getAppleProductKind(productId, configuration.productIds);
  if (!productKind) {
    throw new AppleVerificationError("Verified Apple product ID is not allowed.");
  }
  const expectedType =
    productKind === "SUBSCRIPTION"
      ? Type.AUTO_RENEWABLE_SUBSCRIPTION
      : Type.NON_CONSUMABLE;
  if (decoded.type !== expectedType) {
    throw new AppleVerificationError(
      "Verified Apple transaction product type is invalid."
    );
  }

  const ownershipType = decoded.inAppOwnershipType;
  if (
    ownershipType !== InAppOwnershipType.PURCHASED &&
    ownershipType !== InAppOwnershipType.FAMILY_SHARED
  ) {
    throw new AppleVerificationError(
      "Verified Apple transaction ownership type is invalid."
    );
  }
  if (ownershipType === InAppOwnershipType.FAMILY_SHARED) {
    throw new AppleVerificationError(
      "Family-shared Apple purchases are not enabled for Calistheni."
    );
  }

  const expiresDate = optionalDateFromMilliseconds(
    decoded.expiresDate,
    "expiration date"
  );
  if (productKind === "SUBSCRIPTION" && !expiresDate) {
    throw new AppleVerificationError(
      "Verified Apple subscription expiration date is missing."
    );
  }
  if (productKind === "LIFETIME" && expiresDate) {
    throw new AppleVerificationError(
      "Verified Apple non-consumable unexpectedly expires."
    );
  }

  return {
    environment,
    transactionId: requireAppleString(decoded.transactionId, "transaction ID"),
    originalTransactionId: requireAppleString(
      decoded.originalTransactionId,
      "original transaction ID"
    ),
    bundleId,
    productId,
    productKind,
    appAccountToken: requireUuid(decoded.appAccountToken, "app account token"),
    purchaseDate: appleDateFromMilliseconds(
      decoded.purchaseDate,
      "purchase date"
    ),
    expiresDate,
    revocationDate: optionalDateFromMilliseconds(
      decoded.revocationDate,
      "revocation date"
    ),
    ownershipType,
    signedDate: appleDateFromMilliseconds(decoded.signedDate, "signed date"),
    payloadHash: hashApplePayload(signedTransaction),
  };
}

export function validateVerifiedAppleRenewalInfo(
  decoded: JWSRenewalInfoDecodedPayload,
  expectedEnvironment: AppleRuntimeEnvironment,
  environmentVariables: AppleEnvironmentVariables = process.env
): AppleVerifiedRenewalInfo {
  const configuration = getApplePublicConfiguration(environmentVariables);
  const environment = toRuntimeEnvironment(decoded.environment);
  if (environment !== expectedEnvironment) {
    throw new AppleVerificationError(
      "Verified Apple renewal environment does not match the selected verifier."
    );
  }
  const productId = requireAppleString(decoded.productId, "renewal product ID");
  if (
    getAppleProductKind(productId, configuration.productIds) !== "SUBSCRIPTION"
  ) {
    throw new AppleVerificationError(
      "Verified Apple renewal product is not an allowed subscription."
    );
  }

  return {
    environment,
    originalTransactionId: requireAppleString(
      decoded.originalTransactionId,
      "renewal original transaction ID"
    ),
    productId,
    appAccountToken:
      decoded.appAccountToken == null
        ? null
        : requireUuid(decoded.appAccountToken, "renewal app account token"),
    autoRenewStatus:
      decoded.autoRenewStatus === AutoRenewStatus.ON
        ? true
        : decoded.autoRenewStatus === AutoRenewStatus.OFF
          ? false
          : null,
    gracePeriodExpiresDate: optionalDateFromMilliseconds(
      decoded.gracePeriodExpiresDate,
      "grace period expiration date"
    ),
    isInBillingRetryPeriod: decoded.isInBillingRetryPeriod === true,
    signedDate: appleDateFromMilliseconds(
      decoded.signedDate,
      "renewal signed date"
    ),
  };
}

export async function verifyAppleTransactionWithBoundary(
  signedTransaction: string,
  options: {
    expectedEnvironment?: AppleRuntimeEnvironment;
    getVerifier: (
      environment: AppleRuntimeEnvironment
    ) => AppleSignedDataVerifierBoundary;
    environmentVariables?: AppleEnvironmentVariables;
  }
) {
  const selectedEnvironment = getSignedPayloadEnvironmentHint(
    signedTransaction,
    "transaction"
  );
  if (
    options.expectedEnvironment &&
    options.expectedEnvironment !== selectedEnvironment
  ) {
    throw new AppleVerificationError(
      "Apple transaction environment does not match the expected environment."
    );
  }

  let decoded: JWSTransactionDecodedPayload;
  try {
    decoded = await options
      .getVerifier(selectedEnvironment)
      .verifyAndDecodeTransaction(signedTransaction);
  } catch {
    throw new AppleVerificationError(
      "Apple transaction signature verification failed."
    );
  }
  return validateVerifiedAppleTransaction(
    decoded,
    signedTransaction,
    selectedEnvironment,
    options.environmentVariables
  );
}
