-- Additive food-detail catalogue fields. Existing foods, revisions, and
-- historical nutrition snapshots remain untouched.
ALTER TABLE "Food"
  ADD COLUMN "transFatGrams" DECIMAL(12,3),
  ADD COLUMN "addedSugarGrams" DECIMAL(12,3),
  ADD COLUMN "cholesterolMg" DECIMAL(12,3),
  ADD COLUMN "potassiumMg" DECIMAL(12,3),
  ADD COLUMN "calciumMg" DECIMAL(12,3),
  ADD COLUMN "ironMg" DECIMAL(12,3);

ALTER TABLE "FoodRevision"
  ADD COLUMN "transFatGrams" DECIMAL(12,3),
  ADD COLUMN "addedSugarGrams" DECIMAL(12,3),
  ADD COLUMN "cholesterolMg" DECIMAL(12,3),
  ADD COLUMN "potassiumMg" DECIMAL(12,3),
  ADD COLUMN "calciumMg" DECIMAL(12,3),
  ADD COLUMN "ironMg" DECIMAL(12,3);

CREATE TABLE "FoodDetails" (
  "id" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "productImageUrl" TEXT,
  "nutritionImageUrl" TEXT,
  "ingredientsImageUrl" TEXT,
  "packageQuantityText" TEXT,
  "packageQuantityGrams" DECIMAL(12,3),
  "servingSizeText" TEXT,
  "defaultServingGrams" DECIMAL(12,3),
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ingredientsText" TEXT,
  "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "traces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "additives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nutriScoreGrade" TEXT,
  "novaGroup" INTEGER,
  "nutrientLevels" JSONB,
  "veganStatus" TEXT,
  "vegetarianStatus" TEXT,
  "palmOilStatus" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodDetails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodNutrient" (
  "id" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "nutrientKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "amount" DECIMAL(12,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "basisGrams" DECIMAL(10,3) NOT NULL DEFAULT 100,
  "source" "FoodSource" NOT NULL,
  "sourceExternalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodNutrient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoodDetails_foodId_key" ON "FoodDetails"("foodId");
CREATE UNIQUE INDEX "FoodNutrient_foodId_nutrientKey_unit_key" ON "FoodNutrient"("foodId", "nutrientKey", "unit");
CREATE INDEX "FoodNutrient_foodId_idx" ON "FoodNutrient"("foodId");
ALTER TABLE "FoodDetails" ADD CONSTRAINT "FoodDetails_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodNutrient" ADD CONSTRAINT "FoodNutrient_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
