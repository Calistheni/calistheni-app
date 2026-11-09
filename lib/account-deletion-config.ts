export const MAX_ACCOUNT_DELETION_CRON_BATCH_SIZE = 20;

/** Do not accept permanent deletion requests until scheduled cleanup is operational. */
export function isAccountDeletionRequestsEnabled(value = process.env.ACCOUNT_DELETION_REQUESTS_ENABLED) {
  return value === "true";
}

/** Scheduled production cleanup is opt-in after migrations and staging checks. */
export function isAccountDeletionWorkerEnabled(value = process.env.ACCOUNT_DELETION_WORKER_ENABLED) {
  return value === "true";
}

/** Keep scheduled worker invocations bounded; invalid configuration uses the safe default. */
export function getAccountDeletionBatchLimit(value: string | undefined) {
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 5;
  return Math.max(1, Math.min(MAX_ACCOUNT_DELETION_CRON_BATCH_SIZE, parsed));
}
