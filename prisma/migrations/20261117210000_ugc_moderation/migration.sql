-- Durable social reporting, blocking, and moderator action history.
CREATE TYPE "ModerationReportTarget" AS ENUM ('WORKOUT', 'COMMENT', 'USER', 'PARK', 'PARK_PHOTO');
CREATE TYPE "ModerationReportReason" AS ENUM ('HARASSMENT', 'HATE_SPEECH', 'SEXUAL_CONTENT', 'VIOLENCE', 'SPAM', 'PRIVACY', 'DANGEROUS_ACTIVITY', 'OTHER');
CREATE TYPE "ModerationReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ModerationActionType" AS ENUM ('HIDE_CONTENT', 'RESTORE_CONTENT', 'RESTRICT_USER', 'UNRESTRICT_USER', 'RESOLVE_REPORT', 'DISMISS_REPORT');

ALTER TABLE "User"
  ADD COLUMN "communityRestrictedAt" TIMESTAMP(3),
  ADD COLUMN "communityRestrictionReason" TEXT;

ALTER TABLE "Workout"
  ADD COLUMN "moderationHiddenAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason" TEXT;

ALTER TABLE "WorkoutComment"
  ADD COLUMN "moderationHiddenAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason" TEXT;

CREATE TABLE "UserBlock" (
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "UserBlock_no_self_check" CHECK ("blockerId" <> "blockedId")
);

CREATE TABLE "ModerationReport" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT,
  "targetType" "ModerationReportTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetOwnerId" TEXT,
  "targetLabel" TEXT NOT NULL,
  "targetExcerpt" TEXT,
  "reason" "ModerationReportReason" NOT NULL,
  "explanation" TEXT,
  "status" "ModerationReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAction" (
  "id" TEXT NOT NULL,
  "reportId" TEXT,
  "action" "ModerationActionType" NOT NULL,
  "actorLabel" TEXT NOT NULL,
  "targetType" "ModerationReportTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_communityRestrictedAt_idx" ON "User"("communityRestrictedAt");
CREATE INDEX "Workout_moderationHiddenAt_idx" ON "Workout"("moderationHiddenAt");
CREATE INDEX "WorkoutComment_moderationHiddenAt_idx" ON "WorkoutComment"("moderationHiddenAt");
CREATE INDEX "UserBlock_blockedId_createdAt_idx" ON "UserBlock"("blockedId", "createdAt");
CREATE UNIQUE INDEX "ModerationReport_reporter_target_key" ON "ModerationReport"("reporterId", "targetType", "targetId");
CREATE INDEX "ModerationReport_status_createdAt_idx" ON "ModerationReport"("status", "createdAt");
CREATE INDEX "ModerationReport_targetType_targetId_idx" ON "ModerationReport"("targetType", "targetId");
CREATE INDEX "ModerationReport_targetOwnerId_idx" ON "ModerationReport"("targetOwnerId");
CREATE INDEX "ModerationAction_reportId_createdAt_idx" ON "ModerationAction"("reportId", "createdAt");
CREATE INDEX "ModerationAction_targetType_targetId_createdAt_idx" ON "ModerationAction"("targetType", "targetId", "createdAt");

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ModerationReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
