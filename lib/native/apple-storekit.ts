"use client";

import {
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { acknowledgeThenFinishAppleTransaction } from "@/lib/apple-purchase-flow";
import { APPLE_PRO_PRODUCT_IDS } from "@/lib/apple-iap/products";
import {
  getNativePlatform,
  isIOSApp,
  isNativeApp,
  isNativePluginAvailable,
} from "@/lib/native/platform";

export type AppleSubscriptionPeriod = {
  value: number;
  unit: "day" | "week" | "month" | "year";
};

export type AppleStoreKitProduct = {
  productId: string;
  displayName: string;
  description: string;
  displayPrice: string;
  type: "subscription" | "lifetime";
  subscriptionPeriod: AppleSubscriptionPeriod | null;
};

type AppleStoreKitProductLoadDiagnostics = {
  requestedProductIds: string[];
  returnedProductIds: string[];
  missingProductIds: string[];
  storeKitProductCount: number;
};

export type AppleStoreKitTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment: string;
  signedTransaction: string;
};

export type ApplePurchaseOutcome =
  | { outcome: "success"; transaction: AppleStoreKitTransaction }
  | { outcome: "pending" }
  | { outcome: "userCancelled" }
  | { outcome: "unverified"; message?: string };

export type AppleTransactionUpdate =
  | { status: "verified"; transaction: AppleStoreKitTransaction }
  | { status: "unverified"; transactionId?: string };

type AppleTransactionCollection = {
  transactions: AppleStoreKitTransaction[];
  unverifiedCount: number;
};

type CalistheniStoreKitPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  loadProducts(): Promise<{
    products: AppleStoreKitProduct[];
    diagnostics?: AppleStoreKitProductLoadDiagnostics;
  }>;
  purchase(options: {
    productId: string;
    appAccountToken: string;
  }): Promise<ApplePurchaseOutcome>;
  currentEntitlements(): Promise<AppleTransactionCollection>;
  restorePurchases(): Promise<AppleTransactionCollection>;
  finishTransaction(options: {
    transactionId: string;
  }): Promise<{ finished: boolean }>;
  showManageSubscriptions(): Promise<{ presented: boolean }>;
  addListener(
    eventName: "transactionUpdated",
    listenerFunc: (event: AppleTransactionUpdate) => void
  ): Promise<PluginListenerHandle>;
};

const STOREKIT_PLUGIN_NAME = "CalistheniStoreKit";
const StoreKit = registerPlugin<CalistheniStoreKitPlugin>(STOREKIT_PLUGIN_NAME);

export class AppleStoreKitError extends Error {
  constructor(
    message: string,
    public readonly code = "APPLE_STOREKIT_ERROR",
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "AppleStoreKitError";
  }
}

export function getAppleStoreKitAvailability() {
  const native = isNativeApp();
  const platform = getNativePlatform();
  return {
    native,
    platform,
    pluginAvailable:
      native && platform === "ios" && isNativePluginAvailable(STOREKIT_PLUGIN_NAME),
  };
}

export function canUseAppleStoreKit() {
  return isIOSApp() && getAppleStoreKitAvailability().pluginAvailable;
}

export async function isAppleStoreKitAvailable() {
  if (!canUseAppleStoreKit()) {
    console.info("[apple-iap] StoreKit availability", {
      stage: "plugin_detection",
      available: false,
      ...getAppleStoreKitAvailability(),
    });
    return false;
  }
  try {
    const available = (await StoreKit.isAvailable()).available;
    console.info("[apple-iap] StoreKit availability", {
      stage: "native_check",
      available,
    });
    return available;
  } catch (error) {
    console.warn("[apple-iap] StoreKit availability check failed", {
      stage: "native_check",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: getSafePluginErrorCode(error),
    });
    return false;
  }
}

function requireAppleStoreKit() {
  if (!canUseAppleStoreKit()) {
    throw new AppleStoreKitError(
      "Purchases are unavailable in this version of the app. Please update Calistheni.",
      "APPLE_STOREKIT_UNAVAILABLE"
    );
  }
}

export async function loadAppleStoreKitProducts() {
  requireAppleStoreKit();
  const result = await StoreKit.loadProducts();
  if (!Array.isArray(result.products)) {
    console.warn("[apple-iap] StoreKit returned an invalid product payload", {
      stage: "bridge_response",
      errorCode: "STOREKIT_PRODUCT_PAYLOAD_INVALID",
    });
    throw new AppleStoreKitError(
      "The App Store returned an invalid product response.",
      "STOREKIT_PRODUCT_PAYLOAD_INVALID"
    );
  }
  const expectedTypes = new Map<string, AppleStoreKitProduct["type"]>([
    [APPLE_PRO_PRODUCT_IDS.monthly, "subscription"],
    [APPLE_PRO_PRODUCT_IDS.yearly, "subscription"],
    [APPLE_PRO_PRODUCT_IDS.lifetime, "lifetime"],
  ]);
  const acceptedProducts = result.products.filter(
    (product) => expectedTypes.get(product.productId) === product.type
  );
  const acceptedProductIds = new Set(
    acceptedProducts.map((product) => product.productId)
  );
  const missingProductIds = [...expectedTypes.keys()].filter(
    (productId) => !acceptedProductIds.has(productId)
  );
  const rejectedProducts = result.products
    .filter((product) => !acceptedProductIds.has(product.productId))
    .map((product) => ({
      productId: product.productId,
      type: product.type,
      expectedType: expectedTypes.get(product.productId) ?? null,
    }));

  console.info("[apple-iap] StoreKit product load", {
    stage: "bridge_validation",
    requestedProductIds: [...expectedTypes.keys()],
    nativeProductCount: result.products.length,
    acceptedProductCount: acceptedProducts.length,
    acceptedProductIds: [...acceptedProductIds],
    missingProductIds,
    rejectedProducts,
    nativeDiagnostics: result.diagnostics ?? null,
  });

  return acceptedProducts;
}

function getSafePluginErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

type AppleBillingConfig = {
  appAccountToken: string;
  productIds: typeof APPLE_PRO_PRODUCT_IDS;
};

let activeUserKey: string | null = null;
let activeGeneration = 0;
let activeEntitlementCallback: (() => void) | null = null;
let cachedBillingConfig: { userKey: string; value: AppleBillingConfig } | null =
  null;
let transactionListener: Promise<PluginListenerHandle> | null = null;
const transactionSyncs = new Map<string, Promise<{ isPro: boolean }>>();

function activateAccount(userKey: string | null) {
  if (activeUserKey === userKey) return activeGeneration;
  activeUserKey = userKey;
  activeGeneration += 1;
  activeEntitlementCallback = null;
  cachedBillingConfig = null;
  transactionSyncs.clear();
  return activeGeneration;
}

async function getAppleBillingConfig(userKey: string) {
  if (cachedBillingConfig?.userKey === userKey) {
    return cachedBillingConfig.value;
  }
  let response: Response;
  try {
    response = await fetch("/api/billing/apple/config", {
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[apple-iap] Apple billing config request failed", {
      stage: "config_fetch",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }

  let payload: Partial<AppleBillingConfig> & {
    code?: string;
    error?: string;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    console.warn("[apple-iap] Apple billing config response was invalid", {
      stage: "config_parse",
      status: response.status,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw new AppleStoreKitError(
      "Apple purchase configuration is unavailable right now.",
      "APPLE_CONFIG_INVALID_RESPONSE",
      response.status
    );
  }
  if (
    !response.ok ||
    !payload.appAccountToken ||
    !payload.productIds ||
    payload.productIds.monthly !== APPLE_PRO_PRODUCT_IDS.monthly ||
    payload.productIds.yearly !== APPLE_PRO_PRODUCT_IDS.yearly ||
    payload.productIds.lifetime !== APPLE_PRO_PRODUCT_IDS.lifetime
  ) {
    console.warn("[apple-iap] Apple billing config validation failed", {
      stage: "config_validation",
      status: response.status,
      responseCode: payload.code ?? null,
      hasAppAccountToken: Boolean(payload.appAccountToken),
      receivedProductIds: payload.productIds ?? null,
    });
    throw new AppleStoreKitError(
      payload.error ?? "Apple purchase configuration is unavailable right now.",
      payload.code ?? "APPLE_CONFIG_UNAVAILABLE",
      response.status
    );
  }
  const value = {
    appAccountToken: payload.appAccountToken,
    productIds: payload.productIds,
  } as AppleBillingConfig;
  console.info("[apple-iap] Apple billing config loaded", {
    stage: "config_ready",
    productIds: value.productIds,
  });
  if (activeUserKey === userKey) cachedBillingConfig = { userKey, value };
  return value;
}

async function synchronizeSignedTransaction(signedTransaction: string) {
  const response = await fetch("/api/billing/apple/transactions/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTransactions: [signedTransaction] }),
  });
  const payload = (await response.json()) as {
    code?: string;
    error?: string;
    isPro?: boolean;
  };
  if (!response.ok || typeof payload.isPro !== "boolean") {
    throw new AppleStoreKitError(
      payload.error ?? "Apple purchase verification is unavailable right now.",
      payload.code ?? "APPLE_TRANSACTION_SYNC_FAILED",
      response.status
    );
  }
  return { isPro: payload.isPro };
}

async function finishAppleTransaction(transactionId: string) {
  const result = await StoreKit.finishTransaction({ transactionId });
  // `false` means StoreKit no longer considers it unfinished, normally because
  // the listener and direct purchase path converged on the same transaction.
  if (typeof result.finished !== "boolean") {
    throw new AppleStoreKitError("StoreKit returned an invalid finish result.");
  }
}

function synchronizeAndFinish(
  userKey: string,
  transaction: AppleStoreKitTransaction
) {
  const key = `${userKey}:${transaction.transactionId}`;
  const existing = transactionSyncs.get(key);
  if (existing) return existing;

  const operation = acknowledgeThenFinishAppleTransaction({
    transaction,
    synchronize: synchronizeSignedTransaction,
    finish: finishAppleTransaction,
  }).finally(() => {
    transactionSyncs.delete(key);
  });
  transactionSyncs.set(key, operation);
  return operation;
}

async function synchronizeCollection(
  userKey: string,
  collection: AppleTransactionCollection
) {
  let synchronized = 0;
  let isPro = false;
  const errors: AppleStoreKitError[] = [];
  for (const transaction of collection.transactions) {
    try {
      const result = await synchronizeAndFinish(userKey, transaction);
      synchronized += 1;
      isPro ||= result.isPro;
    } catch (error) {
      errors.push(
        error instanceof AppleStoreKitError
          ? error
          : new AppleStoreKitError("Apple purchase synchronization failed.")
      );
    }
  }
  return {
    found: collection.transactions.length,
    synchronized,
    unverified: collection.unverifiedCount,
    isPro,
    errors,
  };
}

function ensureTransactionListener() {
  if (transactionListener || !canUseAppleStoreKit()) return;
  const listener = StoreKit.addListener(
    "transactionUpdated",
    (event) => {
      const userKey = activeUserKey;
      const generation = activeGeneration;
      if (!userKey || event.status !== "verified") return;
      void synchronizeAndFinish(userKey, event.transaction)
        .then(() => {
          if (activeUserKey === userKey && activeGeneration === generation) {
            activeEntitlementCallback?.();
          }
        })
        .catch((error: unknown) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[apple-iap] transaction update sync deferred", {
              errorType: error instanceof Error ? error.name : "UnknownError",
            });
          }
        });
    }
  );
  transactionListener = listener;
  void listener.catch((error: unknown) => {
    transactionListener = null;
    if (process.env.NODE_ENV === "development") {
      console.warn("[apple-iap] transaction listener unavailable", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  });
}

export function initializeAppleTransactionLifecycle({
  userKey,
  onEntitlementChanged,
}: {
  userKey: string;
  onEntitlementChanged: () => void;
}) {
  const generation = activateAccount(userKey);
  activeEntitlementCallback = onEntitlementChanged;
  if (!canUseAppleStoreKit()) {
    return () => {
      if (activeUserKey === userKey && activeGeneration === generation) {
        activateAccount(null);
      }
    };
  }

  ensureTransactionListener();
  void getAppleBillingConfig(userKey)
    .then(() => synchronizeCurrentAppleTransactions(userKey))
    .catch((error: unknown) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[apple-iap] startup sync deferred", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
    });

  return () => {
    if (activeUserKey === userKey && activeGeneration === generation) {
      activateAccount(null);
    }
  };
}

export function clearAppleTransactionAccount() {
  activateAccount(null);
}

export async function synchronizeCurrentAppleTransactions(userKey: string) {
  requireAppleStoreKit();
  if (activeUserKey !== userKey) return null;
  const generation = activeGeneration;
  const collection = await StoreKit.currentEntitlements();
  const result = await synchronizeCollection(userKey, collection);
  if (
    result.synchronized > 0 &&
    activeUserKey === userKey &&
    activeGeneration === generation
  ) {
    activeEntitlementCallback?.();
  }
  return result;
}

export async function purchaseAppleProduct({
  userKey,
  productId,
}: {
  userKey: string;
  productId: string;
}) {
  requireAppleStoreKit();
  if (!new Set<string>(Object.values(APPLE_PRO_PRODUCT_IDS)).has(productId)) {
    throw new AppleStoreKitError("This Apple product is not available.");
  }
  const configuration = await getAppleBillingConfig(userKey);
  const outcome = await StoreKit.purchase({
    productId,
    appAccountToken: configuration.appAccountToken,
  });
  if (outcome.outcome !== "success") return outcome;

  const acknowledgement = await synchronizeAndFinish(
    userKey,
    outcome.transaction
  );
  if (activeUserKey === userKey) activeEntitlementCallback?.();
  return { ...outcome, isPro: acknowledgement.isPro };
}

export async function restoreApplePurchases(userKey: string) {
  requireAppleStoreKit();
  await getAppleBillingConfig(userKey);
  const collection = await StoreKit.restorePurchases();
  const result = await synchronizeCollection(userKey, collection);
  if (result.synchronized > 0 && activeUserKey === userKey) {
    activeEntitlementCallback?.();
  }
  return result;
}

export async function showAppleSubscriptionManagement() {
  requireAppleStoreKit();
  return StoreKit.showManageSubscriptions();
}
