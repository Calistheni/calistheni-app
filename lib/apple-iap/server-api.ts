import "server-only";

import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";
import {
  getAppleServerApiConfiguration,
  type AppleRuntimeEnvironment,
} from "@/lib/apple-iap/config";
import { normalizeApplePrivateKey } from "@/lib/auth/apple-private-key";

const clients = new Map<AppleRuntimeEnvironment, AppStoreServerAPIClient>();

export function getAppleServerApiClient(
  environment: AppleRuntimeEnvironment
) {
  const cached = clients.get(environment);
  if (cached) return cached;

  const configuration = getAppleServerApiConfiguration(environment);
  const client = new AppStoreServerAPIClient(
    normalizeApplePrivateKey(configuration.privateKey),
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
