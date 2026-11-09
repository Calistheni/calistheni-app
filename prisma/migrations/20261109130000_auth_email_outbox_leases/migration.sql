-- Additive outbox worker state. Existing queued/delivered rows are preserved.
ALTER TABLE "AuthEmailDelivery"
  ADD COLUMN "permanentlyFailedAt" TIMESTAMP(3),
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCategory" TEXT;

CREATE INDEX "AuthEmailDelivery_permanentlyFailedAt_nextAttemptAt_idx"
  ON "AuthEmailDelivery"("permanentlyFailedAt", "nextAttemptAt");
CREATE INDEX "AuthEmailDelivery_leaseExpiresAt_idx"
  ON "AuthEmailDelivery"("leaseExpiresAt");
