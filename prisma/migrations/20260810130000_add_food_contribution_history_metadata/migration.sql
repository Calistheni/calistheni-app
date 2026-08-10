-- Keep moderation facts on the original contribution record. Existing rows remain
-- readable and pending rows do not need fabricated reviewer metadata.
ALTER TABLE "Food"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByAdminLabel" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "mergedIntoFoodId" TEXT;

CREATE INDEX "Food_contributionStatus_reviewedAt_idx"
  ON "Food"("contributionStatus", "reviewedAt");

CREATE INDEX "Food_mergedIntoFoodId_idx"
  ON "Food"("mergedIntoFoodId");
