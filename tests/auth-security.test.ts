import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { verifyAppleAccountEvent, verifyAppleIdentityToken } from "../lib/auth/apple-token-verification.ts";
import { hashPassword, normalizeAuthEmail, validatePassword, verifyPassword } from "../lib/auth/password-core.ts";
import { findNormalizedEmailCollisions } from "../lib/auth/email-collision-preflight.ts";
import { decryptAuthToken, encryptAuthToken } from "../lib/auth/token-encryption.ts";

test("passwords use Argon2id and reject an incorrect password", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.match(encoded, /^\$argon2id\$/);
  assert.equal(await verifyPassword(encoded, "correct horse battery staple"), true);
  assert.equal(await verifyPassword(encoded, "wrong password"), false);
  assert.equal(validatePassword("too short"), "Use at least 12 characters.");
  assert.equal(validatePassword("x".repeat(1025)), "Password is too long.");
  assert.equal(normalizeAuthEmail("  TEST@Example.COM  "), "test@example.com");
});

test("authentication token encryption supports legacy records and versioned key rotation", () => {
  const legacyKey = Buffer.alloc(32, 1).toString("base64url");
  const keyV1 = Buffer.alloc(32, 2).toString("base64url");
  const keyV2 = Buffer.alloc(32, 3).toString("base64url");
  const legacyEnvironment = { AUTH_TOKEN_ENCRYPTION_KEY: legacyKey };
  const legacy = encryptAuthToken("legacy-refresh-token", legacyEnvironment);
  assert.equal(decryptAuthToken({ ...legacy, keyId: null }, legacyEnvironment), "legacy-refresh-token");

  const rotatingEnvironment = {
    AUTH_TOKEN_ENCRYPTION_KEY: legacyKey,
    AUTH_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "v2",
    AUTH_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: keyV1, v2: keyV2 }),
  };
  const current = encryptAuthToken("current-refresh-token", rotatingEnvironment);
  assert.equal(current.keyId, "v2");
  assert.equal(decryptAuthToken(current, rotatingEnvironment), "current-refresh-token");
  assert.equal(decryptAuthToken({ ...legacy, keyId: null }, rotatingEnvironment), "legacy-refresh-token");
  assert.throws(() => decryptAuthToken({ ...current, keyId: "missing" }, rotatingEnvironment));
});

test("email collision preflight uses runtime Unicode and case normalization", () => {
  const collisions = findNormalizedEmailCollisions([
    { userId: "user-1", email: "Test@Example.com", source: "User.email" },
    { userId: "user-2", email: " test@example.COM ", source: "User.email" },
    { userId: "user-3", email: "\u212B@example.com", source: "User.email" },
    { userId: "user-4", email: "\u00C5@EXAMPLE.COM", source: "PasswordCredential.emailNormalized" },
  ]);
  assert.equal(collisions.length, 2);
  assert.ok(collisions.some((collision) => collision.userIds.join(",") === "user-1,user-2"));
  assert.ok(collisions.some((collision) => collision.userIds.join(",") === "user-3,user-4"));
});

async function appleToken(privateKey: CryptoKey, claims: Record<string, unknown> = {}) {
  return new SignJWT({ nonce: "expected-nonce", email: "Relay@privaterelay.appleid.com", email_verified: "true", is_private_email: "true", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://appleid.apple.com")
    .setAudience("com.petershikrenov.calistheni")
    .setSubject("apple-user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

test("Apple verification validates signature, issuer, audience, expiration, nonce and relay email", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = await appleToken(privateKey);
  const identity = await verifyAppleIdentityToken({ idToken: token, key: publicKey, audience: "com.petershikrenov.calistheni", nonce: "expected-nonce" });
  assert.equal(identity.subject, "apple-user-1");
  assert.equal(identity.email, "relay@privaterelay.appleid.com");
  assert.equal(identity.privateRelay, true);
  await assert.rejects(() => verifyAppleIdentityToken({ idToken: token, key: publicKey, audience: "wrong-audience", nonce: "expected-nonce" }));
  await assert.rejects(() => verifyAppleIdentityToken({ idToken: token, key: publicKey, audience: "com.petershikrenov.calistheni", nonce: "wrong-nonce" }));
  const expired = await new SignJWT({ nonce: "expected-nonce" }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://appleid.apple.com").setAudience("com.petershikrenov.calistheni").setSubject("apple-user-1").setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(privateKey);
  await assert.rejects(() => verifyAppleIdentityToken({ idToken: expired, key: publicKey, audience: "com.petershikrenov.calistheni", nonce: "expected-nonce" }));
  const wrongIssuer = await new SignJWT({ nonce: "expected-nonce" }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://attacker.invalid").setAudience("com.petershikrenov.calistheni").setSubject("apple-user-1").setExpirationTime("5m").sign(privateKey);
  await assert.rejects(() => verifyAppleIdentityToken({ idToken: wrongIssuer, key: publicKey, audience: "com.petershikrenov.calistheni", nonce: "expected-nonce" }));
});

test("returning Apple identity remains usable when email is omitted", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = await appleToken(privateKey, { email: undefined, email_verified: undefined, is_private_email: undefined });
  const identity = await verifyAppleIdentityToken({ idToken: token, key: publicKey, audience: "com.petershikrenov.calistheni", nonce: "expected-nonce" });
  assert.equal(identity.email, null);
});

test("Apple account notifications validate JWS claims and normalize supported events", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const payload = await new SignJWT({
    events: {
      type: "consent-revoked",
      sub: "apple-user-1",
      event_time: Math.floor(Date.now() / 1000),
    },
  }).setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://appleid.apple.com")
    .setAudience("com.petershikrenov.calistheni")
    .setJti("event-1")
    .setIssuedAt()
    .sign(privateKey);
  const event = await verifyAppleAccountEvent({
    payload,
    key: publicKey,
    audiences: ["com.petershikrenov.calistheni"],
  });
  assert.equal(event.type, "consent-revoked");
  assert.equal(event.providerAccountId, "apple-user-1");
  await assert.rejects(() => verifyAppleAccountEvent({ payload, key: publicKey, audiences: ["wrong-audience"] }));
});
