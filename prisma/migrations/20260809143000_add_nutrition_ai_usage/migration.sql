CREATE TABLE "NutritionAiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "describeCount" INTEGER NOT NULL DEFAULT 0,
    "aiScanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionAiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NutritionAiUsage_userId_date_key" ON "NutritionAiUsage"("userId", "date");
CREATE INDEX "NutritionAiUsage_date_idx" ON "NutritionAiUsage"("date");

ALTER TABLE "NutritionAiUsage" ADD CONSTRAINT "NutritionAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
