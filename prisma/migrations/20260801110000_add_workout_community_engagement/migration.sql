-- Additive Community engagement data. Existing users and workouts are left intact.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE TYPE "WorkoutNotificationType" AS ENUM ('WORKOUT_LIKED', 'WORKOUT_COMMENTED');

CREATE TABLE "WorkoutLike" (
  "workoutId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutLike_pkey" PRIMARY KEY ("workoutId", "userId")
);

CREATE TABLE "WorkoutComment" (
  "id" TEXT NOT NULL,
  "workoutId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "workoutId" INTEGER NOT NULL,
  "commentId" TEXT,
  "type" "WorkoutNotificationType" NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_username_idx" ON "User"("username");
CREATE INDEX "WorkoutLike_userId_createdAt_idx" ON "WorkoutLike"("userId", "createdAt");
CREATE INDEX "WorkoutComment_workoutId_createdAt_idx" ON "WorkoutComment"("workoutId", "createdAt");
CREATE INDEX "WorkoutComment_userId_createdAt_idx" ON "WorkoutComment"("userId", "createdAt");
CREATE INDEX "WorkoutNotification_userId_readAt_createdAt_idx" ON "WorkoutNotification"("userId", "readAt", "createdAt");
CREATE INDEX "WorkoutNotification_workoutId_createdAt_idx" ON "WorkoutNotification"("workoutId", "createdAt");

ALTER TABLE "WorkoutLike" ADD CONSTRAINT "WorkoutLike_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutLike" ADD CONSTRAINT "WorkoutLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutComment" ADD CONSTRAINT "WorkoutComment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutComment" ADD CONSTRAINT "WorkoutComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutNotification" ADD CONSTRAINT "WorkoutNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutNotification" ADD CONSTRAINT "WorkoutNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutNotification" ADD CONSTRAINT "WorkoutNotification_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutNotification" ADD CONSTRAINT "WorkoutNotification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "WorkoutComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
