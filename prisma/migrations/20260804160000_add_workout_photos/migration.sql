-- Add private, user-owned workout photo records. Objects live in the photo R2
-- bucket below users/<userId>/workouts/<workoutId>/ and are removed by the API
-- before (or alongside) record deletion; the database relation cascades when a
-- workout or account is removed.
CREATE TABLE "WorkoutPhoto" (
    "id" TEXT NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "uploadedFrom" TEXT NOT NULL DEFAULT 'web',
    "compressionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkoutPhoto_storageKey_key" ON "WorkoutPhoto"("storageKey");
CREATE INDEX "WorkoutPhoto_workoutId_createdAt_idx" ON "WorkoutPhoto"("workoutId", "createdAt");
CREATE INDEX "WorkoutPhoto_userId_createdAt_idx" ON "WorkoutPhoto"("userId", "createdAt");

ALTER TABLE "WorkoutPhoto" ADD CONSTRAINT "WorkoutPhoto_workoutId_fkey"
  FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPhoto" ADD CONSTRAINT "WorkoutPhoto_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
