-- Existing entries predate per-field Health export markers. They are manual
-- Calistheni check-ins, so make them available only to the explicit backfill
-- action. Apple Health imports use source = APPLE_HEALTH and are excluded.
UPDATE "BodyMeasurementEntry"
SET "healthExportKinds" = array_remove(
  ARRAY[
    CASE WHEN "bodyweightKg" IS NOT NULL THEN 'BODY_WEIGHT' END,
    CASE WHEN "bodyFatPercentage" IS NOT NULL THEN 'BODY_FAT' END,
    CASE WHEN "waistCm" IS NOT NULL THEN 'WAIST' END,
    CASE WHEN "heightCm" IS NOT NULL THEN 'HEIGHT' END
  ],
  NULL
)
WHERE "source" = 'MANUAL'::"BodyMeasurementSource"
  AND cardinality("healthExportKinds") = 0;
