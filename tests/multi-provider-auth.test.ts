import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("Auth.js preserves database sessions and Google while adding guarded Apple linking", async () => {
  const auth = await source("auth.ts");
  assert.match(auth, /Google\(/);
  assert.match(auth, /Apple\(/);
  assert.match(auth, /strategy: "database"/);
  assert.match(auth, /consumeOAuthLinkIntent/);
  assert.match(auth, /linked\.userId === session\.userId/);
  assert.doesNotMatch(auth, /allowDangerousEmailAccountLinking:\s*true/);
  assert.doesNotMatch(auth, /access_token:\s*account\.access_token/);
  assert.match(auth, /encryptAuthToken/);
  assert.match(auth, /authorization\?\.revokedAt/);
});

test("password flows require origin checks, durable limits, verification and single-use reset", async () => {
  const [register, login, reset, verify, limiter] = await Promise.all([
    source("app/api/auth/password/register/route.ts"),
    source("app/api/auth/password/login/route.ts"),
    source("app/api/auth/password/reset/route.ts"),
    source("app/api/auth/password/verify-email/route.ts"),
    source("lib/auth/rate-limit.ts"),
  ]);
  for (const route of [register, login, reset, verify]) assert.match(route, /assertTrustedAuthOrigin/);
  assert.match(register, /mode: "insensitive"/);
  assert.match(login, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(login, /createDatabaseSession/);
  assert.match(reset, /consumedAt: now/);
  assert.match(reset, /session\.deleteMany/);
  assert.match(reset, /nativeSession\.updateMany/);
  assert.match(verify, /consumed\.count !== 1/);
  assert.match(limiter, /TransactionIsolationLevel\.Serializable/);
  assert.match(limiter, /registerIp/);
  assert.match(limiter, /loginIp/);
});

test("linking is session-bound, expiring, recent-authenticated and refuses a final-method removal", async () => {
  const [linking, accounts, nativeStart, nativeBrowser] = await Promise.all([
    source("lib/auth/account-linking.ts"),
    source("app/api/auth/accounts/route.ts"),
    source("app/api/native-auth/attempt/route.ts"),
    source("app/api/native-auth/browser-start/route.ts"),
  ]);
  assert.match(linking, /sessionTokenHash/);
  assert.match(linking, /expiresAt: \{ gt: now \}/);
  assert.match(linking, /consumedAt: null/);
  assert.match(linking, /isRecentAuthentication/);
  assert.match(accounts, /FINAL_LOGIN_METHOD/);
  assert.match(accounts, /revokeStoredAppleAuthorization/);
  assert.match(accounts, /pg_advisory_xact_lock/);
  assert.match(accounts, /TransactionIsolationLevel\.ReadCommitted/);
  assert.match(nativeStart, /RECENT_AUTH_REQUIRED/);
  assert.match(nativeBrowser, /provider: "google"/);
  assert.match(nativeBrowser, /AUTH_LINK_COOKIE/);
  assert.match(nativeBrowser, /purpose: "OAUTH_LINK"/);
  assert.doesNotMatch(nativeBrowser, /authenticatedAt: new Date\(\)/);
});

test("Apple account-change notifications are verified, replay-safe and non-destructive", async () => {
  const [route, service] = await Promise.all([
    source("app/api/auth/apple/notifications/route.ts"),
    source("lib/auth/apple-account-events.ts"),
  ]);
  assert.match(route, /verifyAppleServerAccountEvent/);
  assert.match(service, /appleAccountEvent\.create/);
  assert.match(route, /error\.code === "P2002"/);
  assert.match(service, /revokedAt: event\.eventTime/);
  assert.match(route, /applyVerifiedAppleAccountEvent/);
  assert.match(service, /authProvider: "apple"/);
  assert.doesNotMatch(`${route}\n${service}`, /user\.delete|account\.delete/);
});

test("migration is additive and leaves canonical users and billing ownership intact", async () => {
  const migration = await source("prisma/migrations/20261103120000_secure_multi_provider_auth/migration.sql");
  assert.match(migration, /ALTER TABLE "Session" ADD COLUMN "authenticatedAt"/);
  assert.match(migration, /CREATE TABLE "PasswordCredential"/);
  assert.match(migration, /CREATE TABLE "AppleAuthorization"/);
  assert.match(migration, /CREATE TABLE "AppleAccountEvent"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE "User"/i);
  assert.doesNotMatch(migration, /ALTER TABLE "User"/);
  assert.doesNotMatch(migration, /ALTER TABLE "Subscription"/);
  assert.doesNotMatch(migration, /ALTER TABLE "ApplePurchase"/);
});
