CREATE TABLE "NativeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "platform" "NativeAuthPlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NativeSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativeSession_tokenHash_key" ON "NativeSession"("tokenHash");
CREATE INDEX "NativeSession_userId_expiresAt_idx" ON "NativeSession"("userId", "expiresAt");
CREATE INDEX "NativeSession_expiresAt_idx" ON "NativeSession"("expiresAt");
CREATE INDEX "NativeSession_revokedAt_idx" ON "NativeSession"("revokedAt");

ALTER TABLE "NativeSession"
ADD CONSTRAINT "NativeSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
