-- Lightweight account-presence signal for the admin support/insight area.
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

CREATE TYPE "UserActivityEventType" AS ENUM ('BARCODE_LOOKUP');

CREATE TABLE "UserActivityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "UserActivityEventType" NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserActivityEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserActivityEvent" ADD CONSTRAINT "UserActivityEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserActivityEvent_userId_createdAt_idx" ON "UserActivityEvent"("userId", "createdAt");
CREATE INDEX "UserActivityEvent_userId_type_createdAt_idx" ON "UserActivityEvent"("userId", "type", "createdAt");
