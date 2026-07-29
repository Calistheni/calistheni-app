-- Allow an exercise to participate in several supersets without duplicating
-- the workout exercise or its set history. Legacy columns remain in place so
-- older deployments and historical rows can still be read safely.
CREATE TABLE "WorkoutSupersetExercise" (
    "supersetId" TEXT NOT NULL,
    "workoutExerciseId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WorkoutSupersetExercise_pkey" PRIMARY KEY ("supersetId", "workoutExerciseId")
);

CREATE TABLE "WorkoutTemplateSupersetExercise" (
    "supersetId" TEXT NOT NULL,
    "templateExerciseId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WorkoutTemplateSupersetExercise_pkey" PRIMARY KEY ("supersetId", "templateExerciseId")
);

ALTER TABLE "WorkoutSet" ADD COLUMN "supersetRoundId" TEXT;

-- Preserve every existing one-to-many membership as the first normalized
-- membership for that exercise. ON CONFLICT makes this migration safe if a
-- deployment has already backfilled a subset during recovery.
INSERT INTO "WorkoutSupersetExercise" ("supersetId", "workoutExerciseId", "position")
SELECT "supersetId", "id", "normalizedPosition"
FROM (
  SELECT "supersetId", "id", ROW_NUMBER() OVER (
    PARTITION BY "supersetId" ORDER BY COALESCE("supersetPosition", 0), "id"
  ) - 1 AS "normalizedPosition"
  FROM "WorkoutExercise"
  WHERE "supersetId" IS NOT NULL
) AS "legacyMembership"
ON CONFLICT ("supersetId", "workoutExerciseId") DO NOTHING;

INSERT INTO "WorkoutTemplateSupersetExercise" ("supersetId", "templateExerciseId", "position")
SELECT "supersetId", "id", "normalizedPosition"
FROM (
  SELECT "supersetId", "id", ROW_NUMBER() OVER (
    PARTITION BY "supersetId" ORDER BY COALESCE("supersetPosition", 0), "id"
  ) - 1 AS "normalizedPosition"
  FROM "WorkoutTemplateExercise"
  WHERE "supersetId" IS NOT NULL
) AS "legacyMembership"
ON CONFLICT ("supersetId", "templateExerciseId") DO NOTHING;

CREATE UNIQUE INDEX "WorkoutSupersetExercise_supersetId_position_key"
ON "WorkoutSupersetExercise"("supersetId", "position");

CREATE INDEX "WorkoutSupersetExercise_workoutExerciseId_idx"
ON "WorkoutSupersetExercise"("workoutExerciseId");

CREATE UNIQUE INDEX "WorkoutTemplateSupersetExercise_supersetId_position_key"
ON "WorkoutTemplateSupersetExercise"("supersetId", "position");

CREATE INDEX "WorkoutTemplateSupersetExercise_templateExerciseId_idx"
ON "WorkoutTemplateSupersetExercise"("templateExerciseId");

CREATE INDEX "WorkoutSet_supersetRoundId_idx"
ON "WorkoutSet"("supersetRoundId");

ALTER TABLE "WorkoutSupersetExercise"
ADD CONSTRAINT "WorkoutSupersetExercise_supersetId_fkey"
FOREIGN KEY ("supersetId") REFERENCES "WorkoutSuperset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutSupersetExercise"
ADD CONSTRAINT "WorkoutSupersetExercise_workoutExerciseId_fkey"
FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutTemplateSupersetExercise"
ADD CONSTRAINT "WorkoutTemplateSupersetExercise_supersetId_fkey"
FOREIGN KEY ("supersetId") REFERENCES "WorkoutTemplateSuperset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutTemplateSupersetExercise"
ADD CONSTRAINT "WorkoutTemplateSupersetExercise_templateExerciseId_fkey"
FOREIGN KEY ("templateExerciseId") REFERENCES "WorkoutTemplateExercise"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
