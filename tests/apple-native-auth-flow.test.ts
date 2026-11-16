import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NativeAppleAuthError,
  getAppleSignInErrorMessage,
  isNativeAppleAuthCancellation,
  performNativeAppleAuthFlow,
  type AppleAuthorizationResult,
} from "../lib/native/apple-auth-core.ts";

const challenge = { state: "state-1", nonce: "nonce-1" };
const credential: AppleAuthorizationResult = {
  state: challenge.state,
  identityToken: "identity-token",
  authorizationCode: "authorization-code",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulFetch() {
  return async (input: URL | RequestInfo) =>
    String(input).endsWith("/start")
      ? jsonResponse(challenge)
      : jsonResponse({ ok: true, redirectTo: "/home" });
}

test("native Apple authentication completes successfully", async () => {
  const outcome = await performNativeAppleAuthFlow("login", {
    fetch: successfulFetch() as typeof fetch,
    authorize: async () => credential,
  });
  assert.deepEqual(outcome, {
    status: "success",
    result: { ok: true, redirectTo: "/home" },
  });
});

test("Capacitor cancellation code becomes a silent typed outcome", async () => {
  let completionRequests = 0;
  const outcome = await performNativeAppleAuthFlow("login", {
    fetch: (async () => {
      completionRequests += 1;
      return jsonResponse(challenge);
    }) as typeof fetch,
    authorize: async () => {
      throw { code: "APPLE_AUTH_CANCELLED", message: "Apple authentication was cancelled." };
    },
  });
  assert.deepEqual(outcome, { status: "cancelled" });
  assert.equal(completionRequests, 1);
  assert.equal(isNativeAppleAuthCancellation(new Error("APPLE_AUTH_CANCELLED")), false);
});

test("the iOS bridge maps ASAuthorization cancellation to a structured code", () => {
  const source = readFileSync(
    new URL("../ios/App/App/CalistheniAppleAuthPlugin.swift", import.meta.url),
    "utf8"
  );
  assert.match(source, /ASAuthorizationError\)\?\.code == \.canceled/);
  assert.match(
    source,
    /call\.reject\("Apple authentication was cancelled\.", "APPLE_AUTH_CANCELLED"\)/
  );
});

test("actual native authentication failures remain typed failures", async () => {
  await assert.rejects(
    performNativeAppleAuthFlow("login", {
      fetch: (async () => jsonResponse(challenge)) as typeof fetch,
      authorize: async () => {
        throw { code: "APPLE_AUTH_FAILED" };
      },
    }),
    (error) =>
      error instanceof NativeAppleAuthError && error.kind === "authentication"
  );
});

test("network and server failures remain distinguishable", async () => {
  await assert.rejects(
    performNativeAppleAuthFlow("login", {
      fetch: (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
      authorize: async () => credential,
    }),
    (error) => error instanceof NativeAppleAuthError && error.kind === "network"
  );

  await assert.rejects(
    performNativeAppleAuthFlow("login", {
      fetch: (async () => jsonResponse({ error: "Unavailable" }, 503)) as typeof fetch,
      authorize: async () => credential,
    }),
    (error) => error instanceof NativeAppleAuthError && error.kind === "server"
  );
});

test("authentication can retry successfully immediately after cancellation", async () => {
  let attempts = 0;
  const authorize = async () => {
    attempts += 1;
    if (attempts === 1) throw { code: "APPLE_AUTH_CANCELLED" };
    return credential;
  };
  const fetchImplementation = successfulFetch() as typeof fetch;

  assert.deepEqual(
    await performNativeAppleAuthFlow("login", { fetch: fetchImplementation, authorize }),
    { status: "cancelled" }
  );
  assert.equal(
    (await performNativeAppleAuthFlow("login", { fetch: fetchImplementation, authorize })).status,
    "success"
  );
});

test("the sign-in UI returns silently on cancellation and resets its single-flight guard", () => {
  const source = readFileSync(
    new URL("../components/auth/AppleSignInButton.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /if \(activeAttempt\.current\) return;/);
  assert.match(source, /if \(outcome\.status === "cancelled"\) return;/);
  assert.match(source, /finally \{[\s\S]*activeAttempt\.current = false;[\s\S]*setBusy\(false\)/);
  assert.doesNotMatch(source, /Apple sign-in was cancelled\./);
});

test("only real failures receive a user-facing error message", () => {
  assert.equal(
    getAppleSignInErrorMessage(new NativeAppleAuthError("authentication", "failed")),
    "Unable to sign in with Apple. Please try again."
  );
  assert.equal(
    getAppleSignInErrorMessage(new NativeAppleAuthError("network", "failed")),
    "Unable to reach Apple sign-in. Check your connection and try again."
  );
});
