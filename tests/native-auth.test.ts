import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_AUTH_DEFAULT_REDIRECT,
  isNativeAuthCallbackUrl,
  isNativeAuthPlatform,
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
    isNativeAuthCallbackUrl("https://calistheni.app/auth/mobile/callback?code=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"),
    true
  );
  assert.equal(
    isNativeAuthCallbackUrl("https://example.com/auth/mobile/callback?code=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"),
    false
  );
  assert.equal(
    isNativeAuthCallbackUrl("http://calistheni.app/auth/mobile/callback?code=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"),
    false
  );
  assert.equal(isNativeAuthCallbackUrl("https://calistheni.app/auth/mobile/callback"), false);
});
