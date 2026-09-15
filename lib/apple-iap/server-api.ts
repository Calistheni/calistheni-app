import "server-only";

import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";
import {
  getAppleServerApiConfiguration,
  type AppleRuntimeEnvironment,
} from "@/lib/apple-iap/config";

const clients = new Map<AppleRuntimeEnvironment, AppStoreServerAPIClient>();

export function getAppleServerApiClient(
  environment: AppleRuntimeEnvironment
) {
  const cached = clients.get(environment);
  if (cached) return cached;

  const configuration = getAppleServerApiConfiguration(environment);
  const client = new AppStoreServerAPIClient(
    configuration.privateKey,
    configuration.keyId,
    configuration.issuerId,
    configuration.bundleId,
    environment === "PRODUCTION"
      ? Environment.PRODUCTION
      : Environment.SANDBOX
  );
  clients.set(environment, client);
  return client;
}
