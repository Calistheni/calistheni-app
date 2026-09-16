import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { acknowledgeThenFinishAppleTransaction } from "../lib/apple-purchase-flow.ts";
import {
  selectProPurchaseSurface,
  selectSubscriptionManagement,
  type BillingGrantSummary,
} from "../lib/billing-provider.ts";
import { APPLE_PRO_PRODUCT_IDS } from "../lib/apple-iap/products.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appleSubscription: BillingGrantSummary = {
  provider: "APPLE",
  kind: "SUBSCRIPTION",
  productId: APPLE_PRO_PRODUCT_IDS.monthly,
  expiresAt: "2026-10-15T12:00:00.000Z",
};
const stripeSubscription: BillingGrantSummary = {
  provider: "STRIPE",
  kind: "SUBSCRIPTION",
  plan: "PRO_MONTHLY",
  expiresAt: "2026-10-15T12:00:00.000Z",
};

test("web selects Stripe while native iOS selects an available StoreKit plugin", () => {
  assert.equal(
    selectProPurchaseSurface({
      native: false,
      platform: "web",
      applePluginAvailable: false,
    }),
    "WEB_STRIPE"
  );
  assert.equal(
    selectProPurchaseSurface({
      native: true,
      platform: "ios",
      applePluginAvailable: true,
    }),
    "NATIVE_APPLE"
  );
});

test("native iOS without the plugin never falls back to Stripe", () => {
  assert.equal(
    selectProPurchaseSurface({
      native: true,
      platform: "ios",
      applePluginAvailable: false,
    }),
    "NATIVE_APPLE_UNAVAILABLE"
  );
  const options = read("components/billing/BillingOptions.tsx");
  assert.match(options, /NATIVE_APPLE_UNAVAILABLE/);
  assert.match(options, /Please update\s+Calistheni/);
});

test("provider-aware management never opens the wrong billing provider", () => {
  assert.equal(
    selectSubscriptionManagement({
      surface: "NATIVE_APPLE",
      grants: [appleSubscription],
    }),
    "APPLE"
  );
  assert.equal(
    selectSubscriptionManagement({
      surface: "NATIVE_APPLE",
      grants: [stripeSubscription],
    }),
    "NONE"
  );
  assert.equal(
    selectSubscriptionManagement({
      surface: "WEB_STRIPE",
      grants: [stripeSubscription],
    }),
    "STRIPE"
  );
  assert.equal(
    selectSubscriptionManagement({
      surface: "WEB_STRIPE",
      grants: [appleSubscription],
    }),
    "NONE"
  );
});

test("a StoreKit transaction is finished only after durable backend acknowledgement", async () => {
  const calls: string[] = [];
  const result = await acknowledgeThenFinishAppleTransaction({
    transaction: {
      transactionId: "200000000001",
      originalTransactionId: "100000000001",
      productId: APPLE_PRO_PRODUCT_IDS.monthly,
      environment: "Production",
      signedTransaction: "signed-jws",
    },
    synchronize: async (signedTransaction) => {
      calls.push(`sync:${signedTransaction}`);
      return { isPro: true };
    },
    finish: async (transactionId) => {
      calls.push(`finish:${transactionId}`);
    },
  });
  assert.deepEqual(calls, ["sync:signed-jws", "finish:200000000001"]);
  assert.equal(result.isPro, true);
});

test("backend failure leaves the StoreKit transaction unfinished", async () => {
  let finished = false;
  await assert.rejects(
    acknowledgeThenFinishAppleTransaction({
      transaction: {
        transactionId: "200000000001",
        originalTransactionId: "100000000001",
        productId: APPLE_PRO_PRODUCT_IDS.monthly,
        environment: "Sandbox",
        signedTransaction: "signed-jws",
      },
      synchronize: async () => {
        throw new Error("backend unavailable");
      },
      finish: async () => {
        finished = true;
      },
    }),
    /backend unavailable/
  );
  assert.equal(finished, false);
});

test("approved Apple product identifiers remain exact across native and web code", () => {
  assert.deepEqual(APPLE_PRO_PRODUCT_IDS, {
    monthly: "com.petershikrenov.calistheni.pro.monthly",
    yearly: "com.petershikrenov.calistheni.pro.yearly",
    lifetime: "com.petershikrenov.calistheni.pro.lifetime",
  });
  const swift = read("ios/App/App/CalistheniStoreKitPlugin.swift");
  for (const productId of Object.values(APPLE_PRO_PRODUCT_IDS)) {
    assert.match(swift, new RegExp(productId.replaceAll(".", "\\.")));
  }
});

test("native prices come from StoreKit metadata and never from Stripe constants", () => {
  const bridge = read("lib/native/apple-storekit.ts");
  const options = read("components/billing/ApplePurchaseOptions.tsx");
  const billing = read("components/billing/BillingOptions.tsx");
  assert.match(bridge, /displayPrice: string/);
  assert.match(options, /product\?\.displayPrice/);
  assert.doesNotMatch(options, /€\s*(7\.99|59\.99|119\.99)/);
  assert.doesNotMatch(options, /\/api\/billing\/checkout/);
  assert.match(billing, /surface === "NATIVE_APPLE"/);
  assert.match(billing, /<ApplePurchaseOptions/);
});

test("StoreKit product loading preserves safe stage diagnostics", () => {
  const swift = read("ios/App/App/CalistheniStoreKitPlugin.swift");
  const bridge = read("lib/native/apple-storekit.ts");
  const options = read("components/billing/ApplePurchaseOptions.tsx");

  assert.match(swift, /product load started/);
  assert.match(swift, /storeKitProductCount/);
  assert.match(swift, /missingProductIds/);
  assert.match(swift, /errorDomain=.*errorCode=/);
  assert.match(bridge, /nativeProductCount/);
  assert.match(bridge, /acceptedProductCount/);
  assert.match(bridge, /rejectedProducts/);
  assert.match(bridge, /stage: "config_fetch"/);
  assert.match(bridge, /stage: "config_validation"/);
  assert.match(options, /stage: "pro_page_initial"/);
  assert.doesNotMatch(swift, /appAccountToken.*product load/);
  assert.doesNotMatch(bridge, /signedTransaction.*StoreKit product load/);
});

test("native purchase UI handles cancellation, pending, unavailable products, and duplicate taps", () => {
  const options = read("components/billing/ApplePurchaseOptions.tsx");
  assert.match(options, /outcome === "userCancelled"/);
  assert.match(options, /outcome === "pending"/);
  assert.match(options, /awaiting approval or confirmation/);
  assert.match(options, /if \(busyAction \|\| isPro\) return/);
  assert.match(options, /busyAction !== null \|\| !product/);
  assert.match(options, /This App Store product is unavailable/);
});

test("successful purchase refresh happens only after the sync-aware purchase helper resolves", () => {
  const bridge = read("lib/native/apple-storekit.ts");
  const options = read("components/billing/ApplePurchaseOptions.tsx");
  assert.match(
    bridge,
    /const acknowledgement = await synchronizeAndFinish[\s\S]*return \{ \.\.\.outcome, isPro: acknowledgement\.isPro \}/
  );
  assert.match(
    options,
    /const result = await purchaseAppleProduct[\s\S]*if \(result\.isPro\)[\s\S]*router\.refresh\(\)/
  );
});

test("restore is explicit and uses the native restore path", () => {
  const options = read("components/billing/ApplePurchaseOptions.tsx");
  const bridge = read("lib/native/apple-storekit.ts");
  const swift = read("ios/App/App/CalistheniStoreKitPlugin.swift");
  assert.match(options, /Restore Purchases/);
  assert.match(options, /restoreApplePurchases\(userKey\)/);
  assert.match(bridge, /StoreKit\.restorePurchases\(\)/);
  assert.match(swift, /try await AppStore\.sync\(\)/);
});

test("one native listener and foreground current-entitlement sync live in NativeShell", () => {
  const bridge = read("lib/native/apple-storekit.ts");
  const shell = read("components/native/NativeShell.tsx");
  const swift = read("ios/App/App/CalistheniStoreKitPlugin.swift");
  assert.match(swift, /guard transactionUpdatesTask == nil else \{ return \}/);
  assert.match(swift, /for await result in Transaction\.updates/);
  assert.match(swift, /Transaction\.currentEntitlements/);
  assert.match(bridge, /let transactionListener: Promise<PluginListenerHandle> \| null/);
  assert.match(shell, /initializeAppleTransactionLifecycle/);
  assert.match(shell, /synchronizeCurrentAppleTransactions/);
  assert.match(shell, /appStateChange/);
});

test("account switching clears user-specific Apple state and ownership stays server authoritative", () => {
  const bridge = read("lib/native/apple-storekit.ts");
  const shell = read("components/native/NativeShell.tsx");
  const ownership = read("lib/apple-iap/ownership.ts");
  assert.match(bridge, /activeUserKey = userKey/);
  assert.match(bridge, /cachedBillingConfig = null/);
  assert.match(bridge, /transactionSyncs\.clear\(\)/);
  assert.match(shell, /clearAppleTransactionAccount\(\)/);
  assert.match(ownership, /belongs to another Calistheni account/);
});

test("existing unified Pro state disables native repurchase regardless of grant provider", () => {
  const options = read("components/billing/ApplePurchaseOptions.tsx");
  const page = read("app/pro/page.tsx");
  assert.match(page, /<BillingOptions[\s\S]*isPro=\{isPro\}/);
  assert.match(options, /disabled=\{isPro \|\| busyAction !== null \|\| !product\}/);
  assert.match(options, /Included with your Pro access/);
});

test("web Checkout Sessions remain the web purchase implementation", () => {
  const billing = read("components/billing/BillingOptions.tsx");
  const checkout = read("components/billing/CheckoutButtons.tsx");
  assert.match(billing, /return \([\s\S]*<CheckoutButtons/);
  assert.match(checkout, /\/api\/billing\/checkout/);
});

test("Swift plugin uses StoreKit 2, appAccountToken, signed JWS, and acknowledgement-controlled finishing", () => {
  const swift = read("ios/App/App/CalistheniStoreKitPlugin.swift");
  assert.match(swift, /import StoreKit/);
  assert.match(swift, /Product\.products\(for:/);
  assert.match(swift, /\.purchase\(options: \[\.appAccountToken\(appAccountToken\)\]\)/);
  assert.match(swift, /verification\.jwsRepresentation/);
  assert.match(swift, /Transaction\.unfinished/);
  assert.match(swift, /await transaction\.finish\(\)/);
  assert.doesNotMatch(swift, /SKPaymentQueue|SKProductsRequest/);
});

test("local StoreKit configuration models all approved products without archive coupling", () => {
  const configuration = JSON.parse(
    read("ios/App/App/Calistheni.storekit")
  ) as {
    products: Array<{ productID: string; type: string }>;
    subscriptionGroups: Array<{
      name: string;
      subscriptions: Array<{
        productID: string;
        recurringSubscriptionPeriod: string;
      }>;
    }>;
  };
  const group = configuration.subscriptionGroups[0];
  assert.equal(group?.name, "Calistheni Pro");
  assert.deepEqual(
    group?.subscriptions.map((product) => [
      product.productID,
      product.recurringSubscriptionPeriod,
    ]),
    [
      [APPLE_PRO_PRODUCT_IDS.monthly, "P1M"],
      [APPLE_PRO_PRODUCT_IDS.yearly, "P1Y"],
    ]
  );
  assert.deepEqual(
    configuration.products.map((product) => [product.productID, product.type]),
    [[APPLE_PRO_PRODUCT_IDS.lifetime, "NonConsumable"]]
  );

  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(project, /Calistheni\.storekit/);
  assert.doesNotMatch(project, /StoreKitConfigurationFileReference/);
});
