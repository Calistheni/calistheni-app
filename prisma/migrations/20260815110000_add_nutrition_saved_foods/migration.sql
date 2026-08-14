-- User-scoped bookmarks for canonical Nutrition foods. This is additive and
-- deliberately does not duplicate mutable Food or immutable entry data.
CREATE TABLE "NutritionSavedFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionSavedFood_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NutritionSavedFood_userId_foodId_key"
ON "NutritionSavedFood"("userId", "foodId");

CREATE INDEX "NutritionSavedFood_userId_createdAt_idx"
ON "NutritionSavedFood"("userId", "createdAt");

CREATE INDEX "NutritionSavedFood_foodId_idx"
ON "NutritionSavedFood"("foodId");

ALTER TABLE "NutritionSavedFood"
ADD CONSTRAINT "NutritionSavedFood_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NutritionSavedFood"
ADD CONSTRAINT "NutritionSavedFood_foodId_fkey"
FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
