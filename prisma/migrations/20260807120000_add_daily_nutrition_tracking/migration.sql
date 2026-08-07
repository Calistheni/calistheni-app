CREATE TYPE "NutritionMealCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS');

ALTER TABLE "NutritionEntrySnapshot" ADD COLUMN "loggedFor" TIMESTAMP(3);
ALTER TABLE "NutritionEntrySnapshot" ADD COLUMN "mealCategory" "NutritionMealCategory";
UPDATE "NutritionEntrySnapshot" SET "loggedFor" = "createdAt", "mealCategory" = 'SNACKS' WHERE "loggedFor" IS NULL;
ALTER TABLE "NutritionEntrySnapshot" ALTER COLUMN "loggedFor" SET NOT NULL;
ALTER TABLE "NutritionEntrySnapshot" ALTER COLUMN "mealCategory" SET NOT NULL;
CREATE INDEX "NutritionEntrySnapshot_userId_loggedFor_idx" ON "NutritionEntrySnapshot"("userId", "loggedFor");

CREATE TABLE "UserNutritionTargets" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "caloriesKcal" DECIMAL(12,3), "proteinGrams" DECIMAL(12,3), "carbohydrateGrams" DECIMAL(12,3), "fatGrams" DECIMAL(12,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNutritionTargets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserNutritionTargets_userId_key" ON "UserNutritionTargets"("userId");
ALTER TABLE "UserNutritionTargets" ADD CONSTRAINT "UserNutritionTargets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
