-- Add private, historical progress tracking. All tables are additive.
CREATE TYPE "SupplementFrequency" AS ENUM ('DAILY', 'SELECTED_WEEKDAYS', 'EVERY_N_DAYS', 'TIMES_PER_WEEK', 'AS_NEEDED');
CREATE TYPE "SupplementTimeOfDay" AS ENUM ('MORNING', 'PRE_WORKOUT', 'POST_WORKOUT', 'AFTERNOON', 'EVENING', 'BEDTIME', 'CUSTOM');

CREATE TABLE "WeeklyProgressReport" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "weekStart" TIMESTAMP(3) NOT NULL, "weekEnd" TIMESTAMP(3) NOT NULL,
  "summary" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "viewedAt" TIMESTAMP(3), "announcementDismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyProgressReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplementDefinition" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplementDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserSupplementPlan" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "supplementDefinitionId" TEXT, "customName" TEXT,
  "dosage" DECIMAL(10,3), "unit" TEXT, "frequency" "SupplementFrequency" NOT NULL DEFAULT 'DAILY', "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "everyNDays" INTEGER, "timesPerWeek" INTEGER, "preferredTime" "SupplementTimeOfDay", "preferredTimeCustom" TEXT, "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSupplementPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplementLog" (
  "id" TEXT NOT NULL, "userSupplementPlanId" TEXT NOT NULL, "scheduledFor" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dosageSnapshot" DECIMAL(10,3), "unitSnapshot" TEXT, "supplementNameSnapshot" TEXT NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplementLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BodyMeasurementEntry" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "measuredAt" TIMESTAMP(3) NOT NULL, "note" TEXT,
  "bodyweightKg" DECIMAL(7,3), "bodyFatPercentage" DECIMAL(5,2), "neckCm" DECIMAL(7,3), "shouldersCm" DECIMAL(7,3), "chestCm" DECIMAL(7,3), "waistCm" DECIMAL(7,3), "abdomenCm" DECIMAL(7,3), "hipsCm" DECIMAL(7,3), "leftUpperArmCm" DECIMAL(7,3), "rightUpperArmCm" DECIMAL(7,3), "leftForearmCm" DECIMAL(7,3), "rightForearmCm" DECIMAL(7,3), "leftThighCm" DECIMAL(7,3), "rightThighCm" DECIMAL(7,3), "leftCalfCm" DECIMAL(7,3), "rightCalfCm" DECIMAL(7,3), "heightCm" DECIMAL(7,3), "wristCm" DECIMAL(7,3), "ankleCm" DECIMAL(7,3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BodyMeasurementEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyProgressReport_userId_weekStart_key" ON "WeeklyProgressReport"("userId", "weekStart");
CREATE INDEX "WeeklyProgressReport_userId_weekStart_idx" ON "WeeklyProgressReport"("userId", "weekStart");
CREATE UNIQUE INDEX "SupplementDefinition_slug_key" ON "SupplementDefinition"("slug");
CREATE INDEX "UserSupplementPlan_userId_isActive_idx" ON "UserSupplementPlan"("userId", "isActive");
CREATE INDEX "UserSupplementPlan_supplementDefinitionId_idx" ON "UserSupplementPlan"("supplementDefinitionId");
CREATE UNIQUE INDEX "SupplementLog_userSupplementPlanId_scheduledFor_key" ON "SupplementLog"("userSupplementPlanId", "scheduledFor");
CREATE INDEX "SupplementLog_scheduledFor_idx" ON "SupplementLog"("scheduledFor");
CREATE INDEX "BodyMeasurementEntry_userId_measuredAt_idx" ON "BodyMeasurementEntry"("userId", "measuredAt");
ALTER TABLE "WeeklyProgressReport" ADD CONSTRAINT "WeeklyProgressReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSupplementPlan" ADD CONSTRAINT "UserSupplementPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSupplementPlan" ADD CONSTRAINT "UserSupplementPlan_supplementDefinitionId_fkey" FOREIGN KEY ("supplementDefinitionId") REFERENCES "SupplementDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplementLog" ADD CONSTRAINT "SupplementLog_userSupplementPlanId_fkey" FOREIGN KEY ("userSupplementPlanId") REFERENCES "UserSupplementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BodyMeasurementEntry" ADD CONSTRAINT "BodyMeasurementEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
