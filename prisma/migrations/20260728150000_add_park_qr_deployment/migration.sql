CREATE TYPE "ParkQrStatus" AS ENUM (
  'NOT_INSTALLED',
  'INSTALLED',
  'NEEDS_REPLACEMENT'
);

ALTER TABLE "Park"
ADD COLUMN "qrStatus" "ParkQrStatus" NOT NULL DEFAULT 'NOT_INSTALLED',
ADD COLUMN "qrInstalledAt" TIMESTAMP(3),
ADD COLUMN "qrInstalledByLabel" TEXT,
ADD COLUMN "qrStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "qrCodeNote" TEXT;

CREATE INDEX "Park_qrStatus_idx" ON "Park"("qrStatus");
