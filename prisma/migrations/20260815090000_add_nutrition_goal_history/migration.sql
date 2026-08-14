-- Effective-dated nutrition goals preserve historical completion semantics.
CREATE TABLE "NutritionGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caloriesKcal" DECIMAL(12,3) NOT NULL,
    "proteinGrams" DECIMAL(12,3) NOT NULL,
    "carbohydrateGrams" DECIMAL(12,3) NOT NULL,
    "fatGrams" DECIMAL(12,3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NutritionGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NutritionGoal_userId_effectiveFrom_key" ON "NutritionGoal"("userId", "effectiveFrom");
CREATE INDEX "NutritionGoal_userId_effectiveFrom_idx" ON "NutritionGoal"("userId", "effectiveFrom");

ALTER TABLE "NutritionGoal" ADD CONSTRAINT "NutritionGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve any existing fully configured target as the user's first goal.
-- Incomplete legacy targets remain untouched rather than being fabricated.
INSERT INTO "NutritionGoal" (
  "id", "userId", "caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams",
  "effectiveFrom", "createdAt", "updatedAt"
)
SELECT
  "id", "userId", "caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams",
  "createdAt"::date, "createdAt", "updatedAt"
FROM "UserNutritionTargets"
WHERE "caloriesKcal" > 0
  AND "proteinGrams" > 0
  AND "carbohydrateGrams" > 0
  AND "fatGrams" > 0
ON CONFLICT ("userId", "effectiveFrom") DO NOTHING;
