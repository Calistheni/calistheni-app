ALTER TABLE "WorkoutSuperset"
ADD COLUMN "plannedRounds" INTEGER;

ALTER TABLE "WorkoutTemplateSuperset"
ADD COLUMN "plannedRounds" INTEGER;

ALTER TABLE "WorkoutSet"
ADD COLUMN "supersetRoundIndex" INTEGER;

CREATE INDEX "WorkoutSet_workoutExerciseId_supersetRoundIndex_idx"
ON "WorkoutSet"("workoutExerciseId", "supersetRoundIndex");
