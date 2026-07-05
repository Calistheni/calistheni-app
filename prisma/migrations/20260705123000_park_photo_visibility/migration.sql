-- AlterTable
ALTER TABLE "ParkPhoto" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ParkPhoto" ADD COLUMN "hiddenAt" TIMESTAMP(3);

-- Backfill the current newest photo as the primary photo for each park.
WITH ranked_photos AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "parkId"
            ORDER BY "createdAt" DESC, "id" DESC
        ) AS "rank"
    FROM "ParkPhoto"
)
UPDATE "ParkPhoto"
SET "isPrimary" = true
FROM ranked_photos
WHERE "ParkPhoto"."id" = ranked_photos."id"
  AND ranked_photos."rank" = 1;

-- CreateIndex
CREATE INDEX "ParkPhoto_parkId_isPrimary_idx" ON "ParkPhoto"("parkId", "isPrimary");

-- CreateIndex
CREATE INDEX "ParkPhoto_parkId_hiddenAt_idx" ON "ParkPhoto"("parkId", "hiddenAt");
