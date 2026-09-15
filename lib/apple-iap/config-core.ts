import {
  APPLE_BUNDLE_ID,
  APPLE_PRO_PRODUCT_IDS,
  getAppleProductIdsList,
} from "@/lib/apple-iap/products";

export type AppleRuntimeEnvironment = "PRODUCTION" | "SANDBOX";
export type AppleEnvironmentVariables = Record<string, string | undefined>;

export class AppleIapConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleIapConfigurationError";
  }
}

function optionalTrimmed(environment: AppleEnvironmentVariables, name: string) {
  const value = environment[name]?.trim();
  return value || null;
}

function requiredEnvironmentValue(
  environment: AppleEnvironmentVariables,
  name: string
) {
  const value = optionalTrimmed(environment, name);
  if (!value) {
    throw new AppleIapConfigurationError(`${name} is not configured.`);
  }
  return value;
}

function configuredOrDefault(
  environment: AppleEnvironmentVariables,
  name: string,
  fallback: string
) {
  return optionalTrimmed(environment, name) ?? fallback;
}

export function getApplePublicConfiguration(
  environment: AppleEnvironmentVariables = process.env
) {
  const bundleId = configuredOrDefault(
    environment,
    "APPLE_BUNDLE_ID",
    APPLE_BUNDLE_ID
  );
  const productIds = {
    monthly: configuredOrDefault(
      environment,
      "APPLE_PRO_MONTHLY_PRODUCT_ID",
      APPLE_PRO_PRODUCT_IDS.monthly
    ),
    yearly: configuredOrDefault(
      environment,
      "APPLE_PRO_YEARLY_PRODUCT_ID",
      APPLE_PRO_PRODUCT_IDS.yearly
    ),
    lifetime: configuredOrDefault(
      environment,
      "APPLE_PRO_LIFETIME_PRODUCT_ID",
      APPLE_PRO_PRODUCT_IDS.lifetime
    ),
  };

  if (bundleId !== APPLE_BUNDLE_ID) {
    throw new AppleIapConfigurationError(
      `APPLE_BUNDLE_ID must be ${APPLE_BUNDLE_ID}.`
    );
  }
  if (
    productIds.monthly !== APPLE_PRO_PRODUCT_IDS.monthly ||
    productIds.yearly !== APPLE_PRO_PRODUCT_IDS.yearly ||
    productIds.lifetime !== APPLE_PRO_PRODUCT_IDS.lifetime
  ) {
    throw new AppleIapConfigurationError(
      "Apple Pro product IDs must match the approved Calistheni products."
    );
  }
  if (new Set(getAppleProductIdsList(productIds)).size !== 3) {
    throw new AppleIapConfigurationError(
      "Apple Pro product IDs must be distinct."
    );
  }

  return { bundleId, productIds };
}

export function getAppleVerificationConfiguration(
  expectedEnvironment: AppleRuntimeEnvironment,
  environment: AppleEnvironmentVariables = process.env
) {
  const publicConfiguration = getApplePublicConfiguration(environment);
  const rawAppAppleId = optionalTrimmed(environment, "APPLE_APP_ID");
  const appAppleId = rawAppAppleId ? Number(rawAppAppleId) : null;

  if (
    expectedEnvironment === "PRODUCTION" &&
    (!Number.isSafeInteger(appAppleId) || Number(appAppleId) <= 0)
  ) {
    throw new AppleIapConfigurationError(
      "APPLE_APP_ID must be a positive numeric App Store app ID for Production verification."
    );
  }

  return {
    ...publicConfiguration,
    appAppleId:
      expectedEnvironment === "PRODUCTION" ? (appAppleId as number) : undefined,
  };
}

export function getAppleServerApiConfiguration(
  expectedEnvironment: AppleRuntimeEnvironment,
  environment: AppleEnvironmentVariables = process.env
) {
  const verification = getAppleVerificationConfiguration(
    expectedEnvironment,
    environment
  );
  const keyId = requiredEnvironmentValue(environment, "APPLE_IAP_KEY_ID");
  const issuerId = requiredEnvironmentValue(environment, "APPLE_IAP_ISSUER_ID");
  const privateKey = requiredEnvironmentValue(
    environment,
    "APPLE_IAP_PRIVATE_KEY"
  ).replaceAll("\\n", "\n");

  if (!/^[A-Z0-9]{10}$/.test(keyId)) {
    throw new AppleIapConfigurationError(
      "APPLE_IAP_KEY_ID must be a 10-character App Store Connect key ID."
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(issuerId)) {
    throw new AppleIapConfigurationError(
      "APPLE_IAP_ISSUER_ID must be an App Store Connect issuer UUID."
    );
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new AppleIapConfigurationError(
      "APPLE_IAP_PRIVATE_KEY is not a PEM private key."
    );
  }

  return { ...verification, keyId, issuerId, privateKey };
}
