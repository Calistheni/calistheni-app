import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLE_AUTH_EXCHANGE_STEPS,
  AppleOAuthExchangeError,
  NativeAppleAuthStageError,
  classifyAppleOAuthError,
  getNativeAppleAuthDiagnostic,
  runNativeAppleAuthStage,
} from "../lib/auth/apple-native-diagnostics.ts";

test("Apple OAuth diagnostics allow only documented categories", () => {
  for (const category of [
    "invalid_client",
    "invalid_grant",
    "invalid_request",
    "unauthorized_client",
    "unsupported_grant_type",
  ]) {
    assert.equal(classifyAppleOAuthError(category), category);
  }
  assert.equal(classifyAppleOAuthError("access_denied"), "unknown");
  assert.equal(classifyAppleOAuthError({ error: "invalid_client" }), "unknown");
  assert.equal(classifyAppleOAuthError(null), "unknown");
});

test("native Apple failures retain only stage and safe OAuth category", async () => {
  const secret = "sensitive-token-authorization-code";
  let failure: unknown;
  try {
    await runNativeAppleAuthStage("authorization_code_exchange", async () => {
      throw new AppleOAuthExchangeError("invalid_client");
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof NativeAppleAuthStageError);
  const diagnostic = getNativeAppleAuthDiagnostic(failure, "session_creation");
  assert.deepEqual(diagnostic, {
    stage: "authorization_code_exchange",
    oauthError: "invalid_client",
    exchangeStep: "apple_token_response",
  });
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "exchangeStep",
    "oauthError",
    "stage",
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(secret));
});

test("arbitrary exceptions cannot leak messages into native Apple diagnostics", async () => {
  const secret = "private-key-and-user-identifier";
  let failure: unknown;
  try {
    await runNativeAppleAuthStage("identity_token_verification", async () => {
      throw new Error(secret);
    });
  } catch (error) {
    failure = error;
  }
  assert.deepEqual(
    getNativeAppleAuthDiagnostic(failure, "session_creation"),
    {
      stage: "identity_token_verification",
      oauthError: "unknown",
      exchangeStep: null,
    }
  );
  assert.doesNotMatch(
    JSON.stringify(getNativeAppleAuthDiagnostic(failure, "session_creation")),
    new RegExp(secret)
  );
});

test("every native Apple exchange operation has a safe diagnostic step", async () => {
  assert.deepEqual(APPLE_AUTH_EXCHANGE_STEPS, [
    "configuration",
    "private_key_parse",
    "private_key_import",
    "client_secret_signing",
    "apple_token_request",
    "apple_token_response",
  ]);
  for (const exchangeStep of APPLE_AUTH_EXCHANGE_STEPS) {
    let failure: unknown;
    try {
      await runNativeAppleAuthStage("authorization_code_exchange", async () => {
        throw new AppleOAuthExchangeError("unknown", exchangeStep);
      });
    } catch (error) {
      failure = error;
    }
    assert.deepEqual(
      getNativeAppleAuthDiagnostic(failure, "session_creation"),
      {
        stage: "authorization_code_exchange",
        oauthError: "unknown",
        exchangeStep,
      }
    );
  }
});

test("native Apple route preserves public behavior while covering every diagnostic stage", () => {
  const route = readFileSync(
    new URL("../app/api/auth/apple/native/complete/route.ts", import.meta.url),
    "utf8"
  );
  for (const stage of [
    "identity_token_verification",
    "authorization_code_exchange",
    "exchanged_token_verification",
    "account_resolution",
    "authorization_persistence",
    "session_creation",
  ]) {
    assert.match(route, new RegExp(`\\b${stage}\\b`));
  }
  assert.match(route, /Apple authentication could not be verified\.[\s\S]*status: 401/);
  assert.match(route, /APPLE_ACCOUNT_ALREADY_LINKED[\s\S]*status: 409/);
  assert.match(route, /ACCOUNT_LINK_REQUIRED[\s\S]*status: 409/);
  assert.match(route, /setDatabaseSessionCookie\(response, sessionToken\)/);
  assert.doesNotMatch(route, /error\.message/);
  assert.doesNotMatch(
    route,
    /console\.(?:log|info|warn|error)\([\s\S]*?(?:body|identityToken|authorizationCode|nonce|state)[\s\S]*?\);/
  );
});

test("Apple code exchange classifies the allow-listed response error without logging its body", () => {
  const source = readFileSync(
    new URL("../lib/auth/apple.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /classifyAppleOAuthError\(body\.error\)/);
  for (const exchangeStep of APPLE_AUTH_EXCHANGE_STEPS) {
    assert.match(source, new RegExp(`\\b${exchangeStep}\\b`));
  }
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
