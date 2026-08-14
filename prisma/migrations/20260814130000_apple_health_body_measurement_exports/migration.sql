ALTER TABLE "User"
ADD COLUMN "appleHealthBodyMeasurementExportEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "BodyMeasurementSource" AS ENUM ('MANUAL', 'APPLE_HEALTH');

ALTER TABLE "BodyMeasurementEntry"
ADD COLUMN "source" "BodyMeasurementSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "BodyMeasurementEntry"
ADD COLUMN "healthExportKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
