ALTER TABLE "User"
ADD COLUMN "appleHealthWorkoutExportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "appleHealthBodyweightImportEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Workout"
ADD COLUMN "appleHealthExportedAt" TIMESTAMP(3);
