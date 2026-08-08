-- Private reusable meal templates. Food revisions keep a template's nutrient
-- composition stable while logged entries still create their own snapshots.
CREATE TABLE "NutritionSavedMeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionSavedMeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NutritionSavedMealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "foodRevisionId" TEXT NOT NULL,
    "grams" DECIMAL(12,3) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionSavedMealItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NutritionSavedMeal_userId_updatedAt_idx" ON "NutritionSavedMeal"("userId", "updatedAt");
CREATE INDEX "NutritionSavedMealItem_mealId_idx" ON "NutritionSavedMealItem"("mealId");
CREATE INDEX "NutritionSavedMealItem_foodId_idx" ON "NutritionSavedMealItem"("foodId");
CREATE INDEX "NutritionSavedMealItem_foodRevisionId_idx" ON "NutritionSavedMealItem"("foodRevisionId");

ALTER TABLE "NutritionSavedMeal" ADD CONSTRAINT "NutritionSavedMeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionSavedMealItem" ADD CONSTRAINT "NutritionSavedMealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "NutritionSavedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionSavedMealItem" ADD CONSTRAINT "NutritionSavedMealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NutritionSavedMealItem" ADD CONSTRAINT "NutritionSavedMealItem_foodRevisionId_fkey" FOREIGN KEY ("foodRevisionId") REFERENCES "FoodRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
