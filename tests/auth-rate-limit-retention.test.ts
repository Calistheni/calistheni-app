import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("authentication rate limits purge only a bounded batch of expired hashed records", async () => {
  const source = await readFile(new URL("../lib/auth/rate-limit.ts", import.meta.url), "utf8");

  assert.match(source, /const EXPIRED_RATE_LIMIT_CLEANUP_BATCH_SIZE = 50/);
  assert.match(source, /WHERE "expiresAt" <= \$\{now\}/);
  assert.match(source, /LIMIT \$\{EXPIRED_RATE_LIMIT_CLEANUP_BATCH_SIZE\}/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /await deleteExpiredRateLimitRows\(tx, now\)/);
  assert.doesNotMatch(source, /DELETE FROM "User"|DELETE FROM "Account"/);
});
