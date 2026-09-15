import assert from "node:assert/strict";
import test from "node:test";
import {
  Environment,
  InAppOwnershipType,
  Type,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import {
  AppleVerificationError,
  getSignedPayloadEnvironmentHint,
  validateVerifiedAppleTransaction,
  verifyAppleTransactionWithBoundary,
} from "../lib/apple-iap/verification-core.ts";
import {
  getApplePublicConfiguration,
  getAppleServerApiConfiguration,
  getAppleVerificationConfiguration,
} from "../lib/apple-iap/config-core.ts";

const accountToken = "11111111-1111-4111-8111-111111111111";

function signedPayload(payload: object) {
  return [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

function decoded(
  overrides: Partial<JWSTransactionDecodedPayload> = {}
): JWSTransactionDecodedPayload {
  return {
    environment: Environment.PRODUCTION,
    bundleId: "com.petershikrenov.calistheni",
    transactionId: "200000000001",
    originalTransactionId: "100000000001",
    productId: "com.petershikrenov.calistheni.pro.monthly",
    type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
    appAccountToken: accountToken,
    inAppOwnershipType: InAppOwnershipType.PURCHASED,
    purchaseDate: Date.parse("2026-09-15T12:00:00Z"),
    expiresDate: Date.parse("2026-10-15T12:00:00Z"),
    signedDate: Date.parse("2026-09-15T12:00:01Z"),
    ...overrides,
  };
}

test("Apple public configuration defaults to the approved IDs without secrets", () => {
  assert.deepEqual(getApplePublicConfiguration({}), {
    bundleId: "com.petershikrenov.calistheni",
    productIds: {
      monthly: "com.petershikrenov.calistheni.pro.monthly",
      yearly: "com.petershikrenov.calistheni.pro.yearly",
      lifetime: "com.petershikrenov.calistheni.pro.lifetime",
    },
  });
  assert.doesNotThrow(() => getAppleVerificationConfiguration("SANDBOX", {}));
  assert.throws(
    () => getAppleVerificationConfiguration("PRODUCTION", {}),
    /APPLE_APP_ID/
  );
  assert.throws(
    () =>
      getApplePublicConfiguration({
        APPLE_PRO_MONTHLY_PRODUCT_ID: "com.example.unapproved.monthly",
      }),
    /approved Calistheni products/
  );
});

test("server API credentials are lazy and validated only when requested", () => {
  assert.doesNotThrow(() => getApplePublicConfiguration({}));
  assert.throws(
    () =>
      getAppleServerApiConfiguration("PRODUCTION", {
        APPLE_APP_ID: "1234567890",
      }),
    /APPLE_IAP_KEY_ID/
  );
  assert.doesNotThrow(() =>
    getAppleServerApiConfiguration("PRODUCTION", {
      APPLE_APP_ID: "1234567890",
      APPLE_IAP_KEY_ID: "ABCDEFGHIJ",
      APPLE_IAP_ISSUER_ID: "11111111-1111-4111-8111-111111111111",
      APPLE_IAP_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\\nexample\\n-----END PRIVATE KEY-----",
    })
  );
});

test("valid Apple transaction passes the injected cryptographic boundary", async () => {
  const jws = signedPayload({ environment: "Production" });
  const result = await verifyAppleTransactionWithBoundary(jws, {
    expectedEnvironment: "PRODUCTION",
    environmentVariables: {},
    getVerifier: (environment) => {
      assert.equal(environment, "PRODUCTION");
      return {
        verifyAndDecodeTransaction: async () => decoded(),
        verifyAndDecodeRenewalInfo: async () => ({}),
        verifyAndDecodeNotification: async () => ({}),
      };
    },
  });
  assert.equal(result.productKind, "SUBSCRIPTION");
  assert.equal(result.appAccountToken, accountToken);
});

test("wrong bundle and unknown products are rejected after verification", () => {
  const jws = signedPayload({ environment: "Production" });
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ bundleId: "com.example.attacker" }),
        jws,
        "PRODUCTION",
        {}
      ),
    /bundle ID is not allowed/
  );
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ productId: "com.example.unknown" }),
        jws,
        "PRODUCTION",
        {}
      ),
    /product ID is not allowed/
  );
});

test("wrong product type, missing token, and Family Sharing are rejected", () => {
  const jws = signedPayload({ environment: "Production" });
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ type: Type.NON_CONSUMABLE }),
        jws,
        "PRODUCTION",
        {}
      ),
    /product type/
  );
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ appAccountToken: undefined }),
        jws,
        "PRODUCTION",
        {}
      ),
    /app account token/
  );
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED }),
        jws,
        "PRODUCTION",
        {}
      ),
    /not enabled/
  );
});

test("Production and Sandbox verifier selection remains explicit and isolated", async () => {
  const sandboxJws = signedPayload({ environment: "Sandbox" });
  assert.equal(
    getSignedPayloadEnvironmentHint(sandboxJws, "transaction"),
    "SANDBOX"
  );
  await assert.rejects(
    verifyAppleTransactionWithBoundary(sandboxJws, {
      expectedEnvironment: "PRODUCTION",
      getVerifier: () => {
        throw new Error("must not be called");
      },
    }),
    /does not match the expected environment/
  );
  assert.throws(
    () =>
      validateVerifiedAppleTransaction(
        decoded({ environment: Environment.SANDBOX }),
        sandboxJws,
        "PRODUCTION",
        {}
      ),
    /does not match the selected verifier/
  );
});

test("malformed and cryptographically invalid JWS values are rejected", async () => {
  assert.throws(
    () => getSignedPayloadEnvironmentHint("not-a-jws", "transaction"),
    AppleVerificationError
  );
  await assert.rejects(
    verifyAppleTransactionWithBoundary(
      signedPayload({ environment: "Production" }),
      {
        getVerifier: () => ({
          verifyAndDecodeTransaction: async () => {
            throw new Error("invalid signature");
          },
          verifyAndDecodeRenewalInfo: async () => ({}),
          verifyAndDecodeNotification: async () => ({}),
        }),
      }
    ),
    /signature verification failed/
  );
});
