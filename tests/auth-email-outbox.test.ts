import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTH_EMAIL_MAX_ATTEMPTS,
  authEmailFailure,
  authEmailQueueHealth,
  authEmailRetryDelayMs,
  classifyAuthEmailHttpStatus,
  isAuthEmailActionUsable,
  isAuthEmailWorkerEnabled,
  isAuthEmailWorkerAuthorized,
} from "../lib/auth/email-outbox-policy.ts";

test("authentication email failures classify transient, permanent, and configuration responses safely", () => {
  assert.deepEqual(classifyAuthEmailHttpStatus(422), { retryable: false, category: "PROVIDER_PERMANENT" });
  assert.deepEqual(classifyAuthEmailHttpStatus(429), { retryable: true, category: "PROVIDER_TRANSIENT" });
  assert.deepEqual(classifyAuthEmailHttpStatus(503), { retryable: true, category: "PROVIDER_TRANSIENT" });
  assert.deepEqual(classifyAuthEmailHttpStatus(401), { retryable: true, category: "PROVIDER_CONFIGURATION" });
  assert.deepEqual(authEmailFailure(new Error("network")), { retryable: true, category: "NETWORK" });
});

test("authentication email retry delay is exponential, bounded, and deterministic", () => {
  assert.equal(authEmailRetryDelayMs(1), 30_000);
  assert.equal(authEmailRetryDelayMs(2), 60_000);
  assert.equal(authEmailRetryDelayMs(3), 120_000);
  assert.equal(authEmailRetryDelayMs(99), 60 * 60 * 1000);
  assert.equal(authEmailRetryDelayMs(2), authEmailRetryDelayMs(2));
  assert.equal(AUTH_EMAIL_MAX_ATTEMPTS, 12);
});

test("outbox eligibility excludes delivered, failed, consumed, expired, and deleted-account actions", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  const valid = { deliveredAt: null, permanentlyFailedAt: null, consumedAt: null, expiresAt: new Date(now.getTime() + 1000), deletedAt: null, now };
  assert.equal(isAuthEmailActionUsable(valid), true);
  assert.equal(isAuthEmailActionUsable({ ...valid, deliveredAt: now }), false);
  assert.equal(isAuthEmailActionUsable({ ...valid, permanentlyFailedAt: now }), false);
  assert.equal(isAuthEmailActionUsable({ ...valid, consumedAt: now }), false);
  assert.equal(isAuthEmailActionUsable({ ...valid, expiresAt: now }), false);
  assert.equal(isAuthEmailActionUsable({ ...valid, deletedAt: now }), false);
});

test("email worker authorization fails closed and compares bearer credentials", () => {
  const secret = "local-auth-email-worker-test-secret-32-chars";
  assert.equal(isAuthEmailWorkerAuthorized(null, [secret]), false);
  assert.equal(isAuthEmailWorkerAuthorized(`Bearer ${secret}`, [undefined]), false);
  assert.equal(isAuthEmailWorkerAuthorized(`Bearer ${secret}`, ["short"]), false);
  assert.equal(isAuthEmailWorkerAuthorized("Bearer wrong-secret", [secret]), false);
  assert.equal(isAuthEmailWorkerAuthorized(`Bearer ${secret}`, [secret]), true);
});

test("email queue monitoring assigns healthy, warning, and critical states", () => {
  assert.equal(authEmailQueueHealth({ permanentlyFailed: 0, expiredLeases: 0, oldestPendingAgeSeconds: null }), "HEALTHY");
  assert.equal(authEmailQueueHealth({ permanentlyFailed: 0, expiredLeases: 0, oldestPendingAgeSeconds: 600 }), "WARNING");
  assert.equal(authEmailQueueHealth({ permanentlyFailed: 1, expiredLeases: 0, oldestPendingAgeSeconds: 10 }), "WARNING");
  assert.equal(authEmailQueueHealth({ permanentlyFailed: 0, expiredLeases: 1, oldestPendingAgeSeconds: 5 }), "CRITICAL");
  assert.equal(authEmailQueueHealth({ permanentlyFailed: 0, expiredLeases: 0, oldestPendingAgeSeconds: 3600 }), "CRITICAL");
});

test("scheduled authentication email delivery is disabled until explicitly enabled", () => {
  assert.equal(isAuthEmailWorkerEnabled(undefined), false);
  assert.equal(isAuthEmailWorkerEnabled("1"), false);
  assert.equal(isAuthEmailWorkerEnabled("true"), true);
});

test("Vercel Hobby retains only the compatible daily account-deletion cron", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
  ) as { crons?: Array<{ path?: string; schedule?: string }> };
  assert.deepEqual(config.crons, [
    { path: "/api/cron/account-deletion", schedule: "0 3 * * *" },
  ]);
});

test("email outbox monitoring is admin-only and contains aggregate metrics only", () => {
  const page = readFileSync(new URL("../app/admin/auth-email/page.tsx", import.meta.url), "utf8");
  assert.match(page, /isAdminAuthenticated\(\)/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(page, /getAuthEmailOutboxStatus\(\)/);
  assert.match(page, /status\.permanentlyFailed/);
  assert.match(page, /Recipient addresses and action tokens are not displayed/);
});
