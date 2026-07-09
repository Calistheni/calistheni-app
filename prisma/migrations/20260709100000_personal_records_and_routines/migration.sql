-- CreateEnum
CREATE TYPE "PersonalRecordType" AS ENUM ('MAX_EXTERNAL_WEIGHT', 'MAX_ADDED_WEIGHT', 'MAX_REPS', 'MAX_SET_VOLUME', 'MAX_EXERCISE_VOLUME', 'LONGEST_DURATION');

-- CreateEnum
CREATE TYPE "WorkoutTemplateVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "type" "PersonalRecordType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "workoutSetId" INTEGER,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "WorkoutTemplateVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateExercise" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "restSeconds" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateSet" (
    "id" SERIAL NOT NULL,
    "templateExerciseId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplateSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalRecord_userId_exerciseId_type_key" ON "PersonalRecord"("userId", "exerciseId", "type");

-- CreateIndex
CREATE INDEX "PersonalRecord_userId_achievedAt_idx" ON "PersonalRecord"("userId", "achievedAt");

-- CreateIndex
CREATE INDEX "PersonalRecord_exerciseId_idx" ON "PersonalRecord"("exerciseId");

-- CreateIndex
CREATE INDEX "PersonalRecord_workoutId_idx" ON "PersonalRecord"("workoutId");

-- CreateIndex
CREATE INDEX "PersonalRecord_workoutSetId_idx" ON "PersonalRecord"("workoutSetId");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_userId_updatedAt_idx" ON "WorkoutTemplate"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkoutTemplate_visibility_idx" ON "WorkoutTemplate"("visibility");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_templateId_order_idx" ON "WorkoutTemplateExercise"("templateId", "order");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_exerciseId_idx" ON "WorkoutTemplateExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateSet_templateExerciseId_order_idx" ON "WorkoutTemplateSet"("templateExerciseId", "order");

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_workoutSetId_fkey" FOREIGN KEY ("workoutSetId") REFERENCES "WorkoutSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateSet" ADD CONSTRAINT "WorkoutTemplateSet_templateExerciseId_fkey" FOREIGN KEY ("templateExerciseId") REFERENCES "WorkoutTemplateExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
