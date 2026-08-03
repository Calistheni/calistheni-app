-- Additive Pro measurement snapshot fields. Existing entries and legacy columns are retained.
ALTER TABLE "BodyMeasurementEntry"
  ADD COLUMN "upperChestCm" DECIMAL(7, 3),
  ADD COLUMN "waistNarrowestCm" DECIMAL(7, 3),
  ADD COLUMN "glutesCm" DECIMAL(7, 3),
  ADD COLUMN "pelvisCm" DECIMAL(7, 3),
  ADD COLUMN "leftUpperArmRelaxedCm" DECIMAL(7, 3),
  ADD COLUMN "rightUpperArmRelaxedCm" DECIMAL(7, 3),
  ADD COLUMN "leftWristCm" DECIMAL(7, 3),
  ADD COLUMN "rightWristCm" DECIMAL(7, 3),
  ADD COLUMN "leftAnkleCm" DECIMAL(7, 3),
  ADD COLUMN "rightAnkleCm" DECIMAL(7, 3);
