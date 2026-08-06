-- Per-user preferences only. Devices use these values to schedule local notifications.
CREATE TABLE "UserSupplementReminderSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderHour" INTEGER NOT NULL DEFAULT 19,
    "reminderMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT,
    "permissionState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSupplementReminderSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSupplementReminderSettings_userId_key" ON "UserSupplementReminderSettings"("userId");

ALTER TABLE "UserSupplementReminderSettings"
ADD CONSTRAINT "UserSupplementReminderSettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
