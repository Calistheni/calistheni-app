CREATE TYPE "SupersetColorKey" AS ENUM ('BLUE', 'VIOLET', 'AMBER', 'GREEN');

CREATE TABLE "WorkoutSuperset" (
    "id" TEXT NOT NULL,
    "workoutId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,
    "colorKey" "SupersetColorKey" NOT NULL,
    "restSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSuperset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutTemplateSuperset" (
    "id" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,
    "colorKey" "SupersetColorKey" NOT NULL,
    "restSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplateSuperset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkoutExercise"
ADD COLUMN "supersetId" TEXT,
ADD COLUMN "supersetPosition" INTEGER;

ALTER TABLE "WorkoutTemplateExercise"
ADD COLUMN "supersetId" TEXT,
ADD COLUMN "supersetPosition" INTEGER;

CREATE UNIQUE INDEX "WorkoutSuperset_workoutId_order_key"
ON "WorkoutSuperset"("workoutId", "order");

CREATE INDEX "WorkoutSuperset_workoutId_idx"
ON "WorkoutSuperset"("workoutId");

CREATE UNIQUE INDEX "WorkoutTemplateSuperset_templateId_order_key"
ON "WorkoutTemplateSuperset"("templateId", "order");

CREATE INDEX "WorkoutTemplateSuperset_templateId_idx"
ON "WorkoutTemplateSuperset"("templateId");

CREATE INDEX "WorkoutExercise_supersetId_supersetPosition_idx"
ON "WorkoutExercise"("supersetId", "supersetPosition");

CREATE INDEX "WorkoutTemplateExercise_supersetId_supersetPosition_idx"
ON "WorkoutTemplateExercise"("supersetId", "supersetPosition");

ALTER TABLE "WorkoutSuperset"
ADD CONSTRAINT "WorkoutSuperset_workoutId_fkey"
FOREIGN KEY ("workoutId") REFERENCES "Workout"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutTemplateSuperset"
ADD CONSTRAINT "WorkoutTemplateSuperset_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutExercise"
ADD CONSTRAINT "WorkoutExercise_supersetId_fkey"
FOREIGN KEY ("supersetId") REFERENCES "WorkoutSuperset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkoutTemplateExercise"
ADD CONSTRAINT "WorkoutTemplateExercise_supersetId_fkey"
FOREIGN KEY ("supersetId") REFERENCES "WorkoutTemplateSuperset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
