CREATE TYPE "FoodContributionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Food"
  ADD COLUMN "contributionStatus" "FoodContributionStatus",
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Food_contributionStatus_createdByUserId_idx"
  ON "Food"("contributionStatus", "createdByUserId");

ALTER TABLE "Food"
  ADD CONSTRAINT "Food_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
