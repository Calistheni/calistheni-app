-- A check-in stores its resolved snapshot; this list records only values the
-- user actually changed, so history/chart/Health exports never infer changes.
ALTER TABLE "BodyMeasurementEntry"
ADD COLUMN "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
