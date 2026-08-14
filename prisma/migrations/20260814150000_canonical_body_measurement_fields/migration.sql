-- Keep all legacy left/right columns and history. Canonical values use the
-- established left-side convention when available, otherwise the right side.
ALTER TABLE "BodyMeasurementEntry"
  ADD COLUMN "bicepsCm" DECIMAL(7, 3),
  ADD COLUMN "forearmCm" DECIMAL(7, 3),
  ADD COLUMN "thighCm" DECIMAL(7, 3),
  ADD COLUMN "calfCm" DECIMAL(7, 3);

UPDATE "BodyMeasurementEntry"
SET
  "bicepsCm" = COALESCE("bicepsCm", "leftUpperArmCm", "rightUpperArmCm"),
  "forearmCm" = COALESCE("forearmCm", "leftForearmCm", "rightForearmCm"),
  "thighCm" = COALESCE("thighCm", "leftThighCm", "rightThighCm"),
  "calfCm" = COALESCE("calfCm", "leftCalfCm", "rightCalfCm")
WHERE "bicepsCm" IS NULL
   OR "forearmCm" IS NULL
   OR "thighCm" IS NULL
   OR "calfCm" IS NULL;
