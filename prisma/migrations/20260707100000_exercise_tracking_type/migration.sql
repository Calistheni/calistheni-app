CREATE TYPE "ExerciseTrackingType" AS ENUM (
  'BODYWEIGHT_REPS',
  'WEIGHTED_BODYWEIGHT',
  'EXTERNAL_WEIGHT',
  'DURATION'
);

ALTER TABLE "Exercise"
ADD COLUMN "trackingType" "ExerciseTrackingType" NOT NULL DEFAULT 'EXTERNAL_WEIGHT',
ADD COLUMN "bodyweightLoadFactor" DOUBLE PRECISION;

CREATE INDEX "Exercise_trackingType_idx" ON "Exercise"("trackingType");
