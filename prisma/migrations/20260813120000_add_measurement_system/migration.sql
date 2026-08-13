-- Canonical workout/body values remain kilograms and meters. This preference
-- changes presentation and input normalization only.
CREATE TYPE "MeasurementSystem" AS ENUM ('METRIC', 'IMPERIAL');

ALTER TABLE "User"
ADD COLUMN "measurementSystem" "MeasurementSystem" NOT NULL DEFAULT 'METRIC';
