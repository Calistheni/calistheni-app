ALTER TYPE "ExerciseTrackingType" ADD VALUE IF NOT EXISTS 'DISTANCE_DURATION';
ALTER TYPE "ExerciseTrackingType" ADD VALUE IF NOT EXISTS 'STEPS_DISTANCE_DURATION';
ALTER TYPE "ExerciseTrackingType" ADD VALUE IF NOT EXISTS 'FLOORS_DISTANCE_DURATION';
ALTER TYPE "ExerciseTrackingType" ADD VALUE IF NOT EXISTS 'WEIGHT_DISTANCE_DURATION';

ALTER TABLE "WorkoutSet"
ADD COLUMN "steps" INTEGER,
ADD COLUMN "floors" INTEGER;

UPDATE "Exercise"
SET
  "trackingType" = 'DISTANCE_DURATION',
  "bodyweightLoadFactor" = NULL
WHERE "name" IN (
  'Air Bike',
  'Elliptical Trainer',
  'Running',
  'Spinning',
  'Treadmill',
  'Rowing Machine'
);

UPDATE "Exercise"
SET
  "trackingType" = 'STEPS_DISTANCE_DURATION',
  "bodyweightLoadFactor" = NULL
WHERE "name" = 'Stair Machine (Steps)';

UPDATE "Exercise"
SET
  "trackingType" = 'FLOORS_DISTANCE_DURATION',
  "bodyweightLoadFactor" = NULL
WHERE "name" = 'Stair Machine (Floors)';

UPDATE "Exercise"
SET
  "trackingType" = 'WEIGHT_DISTANCE_DURATION',
  "bodyweightLoadFactor" = NULL
WHERE "name" = 'Sled Push';
