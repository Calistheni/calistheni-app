-- CreateTable
CREATE TABLE "ParkPhoto" (
    "id" SERIAL NOT NULL,
    "parkId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkEditSubmission" (
    "id" SERIAL NOT NULL,
    "parkId" INTEGER NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "ParkSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "title" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "equipmentIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkEditSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkPhoto_parkId_idx" ON "ParkPhoto"("parkId");

-- CreateIndex
CREATE INDEX "ParkPhoto_uploadedById_idx" ON "ParkPhoto"("uploadedById");

-- CreateIndex
CREATE INDEX "ParkEditSubmission_parkId_idx" ON "ParkEditSubmission"("parkId");

-- CreateIndex
CREATE INDEX "ParkEditSubmission_submittedById_idx" ON "ParkEditSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "ParkEditSubmission_status_idx" ON "ParkEditSubmission"("status");

-- Backfill existing single-photo parks into the photo table.
INSERT INTO "ParkPhoto" ("parkId", "url", "uploadedById")
SELECT "id", "photoUrl", "submittedById"
FROM "Park"
WHERE "photoUrl" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "ParkPhoto" ADD CONSTRAINT "ParkPhoto_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkPhoto" ADD CONSTRAINT "ParkPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkEditSubmission" ADD CONSTRAINT "ParkEditSubmission_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkEditSubmission" ADD CONSTRAINT "ParkEditSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
