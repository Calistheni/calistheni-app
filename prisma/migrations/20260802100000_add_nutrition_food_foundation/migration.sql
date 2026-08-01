-- Additive nutrition catalogue foundation. Canonical values are stored per 100g
-- using NUMERIC/Decimal-compatible columns; existing app data is untouched.
CREATE TYPE "FoodType" AS ENUM ('GENERIC', 'BRANDED', 'RECIPE', 'USER_CREATED');
CREATE TYPE "FoodSource" AS ENUM ('USDA', 'OPEN_FOOD_FACTS', 'USER', 'CALISTHENI');
CREATE TYPE "FoodVerificationStatus" AS ENUM ('UNVERIFIED', 'OFFICIAL_SOURCE', 'COMMUNITY_SOURCE', 'COMMUNITY_REVIEWED', 'CALISTHENI_VERIFIED', 'DISPUTED');
CREATE TYPE "FoodImportStatus" AS ENUM ('ACTIVE', 'INCOMPLETE', 'ARCHIVED');
CREATE TYPE "FoodFreshnessStatus" AS ENUM ('FRESH', 'STALE', 'REVALIDATING', 'PROVIDER_UNAVAILABLE', 'SOURCE_REMOVED');
CREATE TYPE "FoodRevisionReason" AS ENUM ('INITIAL_IMPORT', 'PROVIDER_UPDATE', 'ADMIN_CORRECTION', 'USER_CORRECTION', 'NORMALIZATION_CHANGE', 'MANUAL_REFRESH');
CREATE TYPE "FoodDataValueSource" AS ENUM ('PROVIDER', 'DERIVED', 'MANUAL');

CREATE TABLE "Food" (
  "id" TEXT NOT NULL, "type" "FoodType" NOT NULL, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL,
  "description" TEXT, "brandName" TEXT, "barcode" TEXT, "imageUrl" TEXT, "languageCode" TEXT,
  "countryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "nutritionBasisGrams" DECIMAL(10,3) NOT NULL DEFAULT 100,
  "caloriesKcal" DECIMAL(12,3), "proteinGrams" DECIMAL(12,3), "carbohydrateGrams" DECIMAL(12,3), "fatGrams" DECIMAL(12,3), "fiberGrams" DECIMAL(12,3), "sugarGrams" DECIMAL(12,3), "saturatedFatGrams" DECIMAL(12,3), "sodiumMg" DECIMAL(12,3), "saltGrams" DECIMAL(12,3),
  "calorieValueSource" "FoodDataValueSource" NOT NULL DEFAULT 'PROVIDER', "source" "FoodSource" NOT NULL, "sourceExternalId" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3), "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastFetchedAt" TIMESTAMP(3), "lastRevalidatedAt" TIMESTAMP(3), "nextRevalidateAt" TIMESTAMP(3),
  "verificationStatus" "FoodVerificationStatus" NOT NULL, "importStatus" "FoodImportStatus" NOT NULL DEFAULT 'ACTIVE', "freshnessStatus" "FoodFreshnessStatus" NOT NULL DEFAULT 'FRESH',
  "confidenceScore" DECIMAL(5,4) NOT NULL DEFAULT 0, "currentRevisionId" TEXT, "searchCount" INTEGER NOT NULL DEFAULT 0, "selectionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodServing" (
  "id" TEXT NOT NULL, "foodId" TEXT NOT NULL, "name" TEXT NOT NULL, "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1, "grams" DECIMAL(12,3) NOT NULL, "householdUnit" TEXT, "isDefault" BOOLEAN NOT NULL DEFAULT false, "source" "FoodSource" NOT NULL, "sourceExternalId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodServing_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodAlias" ("id" TEXT NOT NULL, "foodId" TEXT NOT NULL, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL, "languageCode" TEXT, "source" "FoodSource" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FoodAlias_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FoodSourceRecord" ("id" TEXT NOT NULL, "foodId" TEXT NOT NULL, "source" "FoodSource" NOT NULL, "sourceExternalId" TEXT NOT NULL, "rawData" JSONB NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sourceUpdatedAt" TIMESTAMP(3), "checksum" TEXT NOT NULL, "sourceVersion" TEXT, "httpEtag" TEXT, "httpLastModified" TEXT, "responseStatus" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FoodSourceRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FoodRevision" (
  "id" TEXT NOT NULL, "foodId" TEXT NOT NULL, "revisionNumber" INTEGER NOT NULL, "reason" "FoodRevisionReason" NOT NULL, "source" "FoodSource" NOT NULL, "sourceExternalId" TEXT NOT NULL, "name" TEXT NOT NULL, "brandName" TEXT, "barcode" TEXT, "imageUrl" TEXT, "nutritionBasisGrams" DECIMAL(10,3) NOT NULL DEFAULT 100,
  "caloriesKcal" DECIMAL(12,3), "proteinGrams" DECIMAL(12,3), "carbohydrateGrams" DECIMAL(12,3), "fatGrams" DECIMAL(12,3), "fiberGrams" DECIMAL(12,3), "sugarGrams" DECIMAL(12,3), "saturatedFatGrams" DECIMAL(12,3), "sodiumMg" DECIMAL(12,3), "saltGrams" DECIMAL(12,3), "confidenceScore" DECIMAL(5,4) NOT NULL DEFAULT 0, "verificationStatus" "FoodVerificationStatus" NOT NULL, "sourceUpdatedAt" TIMESTAMP(3), "sourceRecordId" TEXT, "normalizedDataChecksum" TEXT NOT NULL, "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoodRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NutritionEntrySnapshot" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "foodId" TEXT NOT NULL, "foodRevisionId" TEXT NOT NULL, "foodNameSnapshot" TEXT NOT NULL, "brandNameSnapshot" TEXT, "barcodeSnapshot" TEXT, "quantity" DECIMAL(12,3) NOT NULL, "unit" TEXT NOT NULL, "gramsConsumed" DECIMAL(12,3) NOT NULL,
  "caloriesKcalSnapshot" DECIMAL(12,3), "proteinGramsSnapshot" DECIMAL(12,3), "carbohydrateGramsSnapshot" DECIMAL(12,3), "fatGramsSnapshot" DECIMAL(12,3), "fiberGramsSnapshot" DECIMAL(12,3), "sugarGramsSnapshot" DECIMAL(12,3), "saturatedFatGramsSnapshot" DECIMAL(12,3), "sodiumMgSnapshot" DECIMAL(12,3), "saltGramsSnapshot" DECIMAL(12,3), "nutritionBasisGramsSnapshot" DECIMAL(10,3) NOT NULL, "sourceSnapshot" "FoodSource" NOT NULL, "sourceExternalIdSnapshot" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NutritionEntrySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Food_barcode_key" ON "Food"("barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX "Food_source_sourceExternalId_key" ON "Food"("source", "sourceExternalId");
CREATE UNIQUE INDEX "Food_currentRevisionId_key" ON "Food"("currentRevisionId");
CREATE UNIQUE INDEX "FoodAlias_foodId_normalizedName_key" ON "FoodAlias"("foodId", "normalizedName");
CREATE UNIQUE INDEX "FoodRevision_foodId_revisionNumber_key" ON "FoodRevision"("foodId", "revisionNumber");
CREATE INDEX "Food_normalizedName_idx" ON "Food"("normalizedName"); CREATE INDEX "Food_brandName_idx" ON "Food"("brandName"); CREATE INDEX "Food_source_idx" ON "Food"("source"); CREATE INDEX "Food_sourceExternalId_idx" ON "Food"("sourceExternalId"); CREATE INDEX "Food_freshnessStatus_idx" ON "Food"("freshnessStatus"); CREATE INDEX "Food_nextRevalidateAt_idx" ON "Food"("nextRevalidateAt"); CREATE INDEX "Food_searchCount_idx" ON "Food"("searchCount"); CREATE INDEX "Food_selectionCount_idx" ON "Food"("selectionCount");
CREATE INDEX "FoodServing_foodId_idx" ON "FoodServing"("foodId"); CREATE INDEX "FoodAlias_normalizedName_idx" ON "FoodAlias"("normalizedName"); CREATE INDEX "FoodSourceRecord_foodId_fetchedAt_idx" ON "FoodSourceRecord"("foodId", "fetchedAt"); CREATE INDEX "FoodSourceRecord_source_sourceExternalId_idx" ON "FoodSourceRecord"("source", "sourceExternalId"); CREATE INDEX "FoodSourceRecord_checksum_idx" ON "FoodSourceRecord"("checksum"); CREATE INDEX "FoodRevision_foodId_createdAt_idx" ON "FoodRevision"("foodId", "createdAt"); CREATE INDEX "FoodRevision_normalizedDataChecksum_idx" ON "FoodRevision"("normalizedDataChecksum"); CREATE INDEX "NutritionEntrySnapshot_userId_createdAt_idx" ON "NutritionEntrySnapshot"("userId", "createdAt"); CREATE INDEX "NutritionEntrySnapshot_foodId_idx" ON "NutritionEntrySnapshot"("foodId"); CREATE INDEX "NutritionEntrySnapshot_foodRevisionId_idx" ON "NutritionEntrySnapshot"("foodRevisionId");

ALTER TABLE "FoodServing" ADD CONSTRAINT "FoodServing_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodAlias" ADD CONSTRAINT "FoodAlias_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodSourceRecord" ADD CONSTRAINT "FoodSourceRecord_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodRevision" ADD CONSTRAINT "FoodRevision_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodRevision" ADD CONSTRAINT "FoodRevision_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "FoodSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Food" ADD CONSTRAINT "Food_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "FoodRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NutritionEntrySnapshot" ADD CONSTRAINT "NutritionEntrySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionEntrySnapshot" ADD CONSTRAINT "NutritionEntrySnapshot_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NutritionEntrySnapshot" ADD CONSTRAINT "NutritionEntrySnapshot_foodRevisionId_fkey" FOREIGN KEY ("foodRevisionId") REFERENCES "FoodRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
