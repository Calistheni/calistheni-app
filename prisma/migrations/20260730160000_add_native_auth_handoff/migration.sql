-- Short-lived, one-time bridge from the external OAuth browser to the
-- first-party Capacitor WebView. No raw OAuth, PKCE, or handoff secrets live
-- in this table.
CREATE TYPE "NativeAuthPlatform" AS ENUM ('IOS', 'ANDROID');

CREATE TABLE "NativeAuthAttempt" (
    "id" TEXT NOT NULL,
    "platform" "NativeAuthPlatform" NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "handoffCodeHash" TEXT,
    "redirectPath" TEXT NOT NULL DEFAULT '/home',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "handoffIssuedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "NativeAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativeAuthAttempt_handoffCodeHash_key"
ON "NativeAuthAttempt"("handoffCodeHash");

CREATE INDEX "NativeAuthAttempt_expiresAt_idx"
ON "NativeAuthAttempt"("expiresAt");

CREATE INDEX "NativeAuthAttempt_userId_createdAt_idx"
ON "NativeAuthAttempt"("userId", "createdAt");

CREATE INDEX "NativeAuthAttempt_consumedAt_idx"
ON "NativeAuthAttempt"("consumedAt");

ALTER TABLE "NativeAuthAttempt"
ADD CONSTRAINT "NativeAuthAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
