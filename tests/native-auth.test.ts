import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  NATIVE_AUTH_DEFAULT_REDIRECT,
  createNativeAuthCustomSchemeUrl,
  createNativeAuthProof,
  isNativeAuthCode,
  isNativeAuthCallbackUrl,
  isNativeAuthPlatform,
  parseNativeAuthCallbackUrl,
  sanitizeNativeRedirectPath,
} from "../lib/auth/native-auth.ts";

test("native redirects remain inside the Calistheni application", () => {
  assert.equal(sanitizeNativeRedirectPath("/parks?from=login"), "/parks?from=login");
  assert.equal(sanitizeNativeRedirectPath("https://attacker.example"), NATIVE_AUTH_DEFAULT_REDIRECT);
  assert.equal(sanitizeNativeRedirectPath("//attacker.example"), NATIVE_AUTH_DEFAULT_REDIRECT);
  assert.equal(sanitizeNativeRedirectPath("/api/admin/parks"), NATIVE_AUTH_DEFAULT_REDIRECT);
  assert.equal(sanitizeNativeRedirectPath("/mobile/auth/complete"), NATIVE_AUTH_DEFAULT_REDIRECT);
});

test("native handoff accepts only supported platforms and its verified callback path", () => {
  assert.equal(isNativeAuthPlatform("IOS"), true);
  assert.equal(isNativeAuthPlatform("ANDROID"), true);
  assert.equal(isNativeAuthPlatform("web"), false);
  assert.equal(
    isNativeAuthCallbackUrl("https://calistheni.app/auth/mobile/callback?attempt=c123456789012345678901234"),
    true
  );
  assert.equal(
    isNativeAuthCallbackUrl("https://example.com/auth/mobile/callback?attempt=c123456789012345678901234"),
    false
  );
  assert.equal(
    isNativeAuthCallbackUrl("http://calistheni.app/auth/mobile/callback?attempt=c123456789012345678901234"),
    false
  );
  assert.equal(isNativeAuthCallbackUrl("https://calistheni.app/auth/mobile/callback"), false);

  const attempt = "c123456789012345678901234";
  const https = parseNativeAuthCallbackUrl(`https://calistheni.app/auth/mobile/callback?attempt=${attempt}`);
  const scheme = parseNativeAuthCallbackUrl(`calistheni://auth/mobile/callback?attempt=${attempt}`);
  assert.deepEqual(https, { attempt });
  assert.deepEqual(scheme, https);
  assert.equal(createNativeAuthCustomSchemeUrl(attempt), `calistheni://auth/mobile/callback?attempt=${attempt}`);
  assert.equal(parseNativeAuthCallbackUrl(`calistheni://wrong/mobile/callback?attempt=${attempt}`), null);
  assert.equal(parseNativeAuthCallbackUrl(`calistheni://auth/wrong?attempt=${attempt}`), null);
  assert.equal(parseNativeAuthCallbackUrl(`other://auth/mobile/callback?attempt=${attempt}`), null);
  assert.equal(parseNativeAuthCallbackUrl("calistheni://auth/mobile/callback"), null);
});

test("each native sign-in generates a fresh verifier and compatible SHA-256 challenge", async () => {
  const first = await createNativeAuthProof();
  const second = await createNativeAuthProof();
  assert.ok(isNativeAuthCode(first.verifier));
  assert.notEqual(first.verifier, second.verifier);
  assert.equal(first.verifierChallenge, createHash("sha256").update(first.verifier).digest("hex"));
});
