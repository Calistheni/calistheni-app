import assert from "node:assert/strict";
import test from "node:test";
import { getAccountDeletionBatchLimit, isAccountDeletionRequestsEnabled, isAccountDeletionWorkerEnabled, MAX_ACCOUNT_DELETION_CRON_BATCH_SIZE } from "../lib/account-deletion-config";

test("deletion cron batch limit uses a safe bounded default and clamps configured values", () => {
  assert.equal(getAccountDeletionBatchLimit(undefined), 5);
  assert.equal(getAccountDeletionBatchLimit("invalid"), 5);
  assert.equal(getAccountDeletionBatchLimit("0"), 1);
  assert.equal(getAccountDeletionBatchLimit("7"), 7);
  assert.equal(getAccountDeletionBatchLimit("100"), MAX_ACCOUNT_DELETION_CRON_BATCH_SIZE);
});

test("scheduled deletion cleanup is disabled by default and requires explicit opt-in", () => {
  assert.equal(isAccountDeletionWorkerEnabled(undefined), false);
  assert.equal(isAccountDeletionWorkerEnabled("TRUE"), false);
  assert.equal(isAccountDeletionWorkerEnabled("true"), true);
});

test("deletion requests are disabled until cleanup is ready for production", () => {
  assert.equal(isAccountDeletionRequestsEnabled(undefined), false);
  assert.equal(isAccountDeletionRequestsEnabled("true"), true);
  assert.equal(isAccountDeletionRequestsEnabled("1"), false);
});
