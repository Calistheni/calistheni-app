-- Additive multi-provider authentication foundation. Existing users, OAuth
-- accounts, sessions, billing ownership and application data are unchanged.
CREATE TYPE "AuthActionTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "NativeAuthIntent" AS ENUM ('LOGIN', 'LINK');
CREATE TYPE "SessionPurpose" AS ENUM ('APPLICATION', 'OAUTH_LINK');

ALTER TABLE "Session" ADD COLUMN "authenticatedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "purpose" "SessionPurpose" NOT NULL DEFAULT 'APPLICATION';
ALTER TABLE "Session" ADD COLUMN "authProvider" TEXT;
ALTER TABLE "NativeAuthAttempt" ADD COLUMN "intent" "NativeAuthIntent" NOT NULL DEFAULT 'LOGIN';
ALTER TABLE "NativeAuthAttempt" ADD COLUMN "browserStartedAt" TIMESTAMP(3);

CREATE TABLE "PasswordCredential" (
    "userId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AuthActionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthActionTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthActionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRateLimit" (
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("keyHash")
);

CREATE TABLE "AuthLinkIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nativeAuthAttemptId" TEXT,
    "pendingProviderAccountId" TEXT,
    "pendingAccountType" TEXT,
    "pendingExpiresAt" INTEGER,
    "pendingScope" TEXT,
    CONSTRAINT "AuthLinkIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleAuthAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "intent" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "sessionTokenHash" TEXT,
    "redirectPath" TEXT NOT NULL DEFAULT '/home',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppleAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleAuthorization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT NOT NULL,
    "refreshTokenIv" TEXT NOT NULL,
    "refreshTokenTag" TEXT NOT NULL,
    "encryptionKeyId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revocationPendingAt" TIMESTAMP(3),
    "emailForwardingEnabled" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppleAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthEmailDelivery" (
    "id" TEXT NOT NULL,
    "actionTokenId" TEXT NOT NULL,
    "purpose" "AuthActionTokenPurpose" NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenTag" TEXT NOT NULL,
    "encryptionKeyId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleAccountEvent" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "privateRelay" BOOLEAN,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppleAccountEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordCredential_emailNormalized_key" ON "PasswordCredential"("emailNormalized");
CREATE UNIQUE INDEX "AuthActionToken_tokenHash_key" ON "AuthActionToken"("tokenHash");
CREATE INDEX "AuthActionToken_userId_purpose_createdAt_idx" ON "AuthActionToken"("userId", "purpose", "createdAt");
CREATE INDEX "AuthActionToken_expiresAt_idx" ON "AuthActionToken"("expiresAt");
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
CREATE INDEX "AuthRateLimit_action_blockedUntil_idx" ON "AuthRateLimit"("action", "blockedUntil");
CREATE UNIQUE INDEX "AuthLinkIntent_secretHash_key" ON "AuthLinkIntent"("secretHash");
CREATE UNIQUE INDEX "AuthLinkIntent_nativeAuthAttemptId_key" ON "AuthLinkIntent"("nativeAuthAttemptId");
CREATE INDEX "AuthLinkIntent_userId_provider_createdAt_idx" ON "AuthLinkIntent"("userId", "provider", "createdAt");
CREATE INDEX "AuthLinkIntent_expiresAt_idx" ON "AuthLinkIntent"("expiresAt");
CREATE UNIQUE INDEX "AppleAuthAttempt_stateHash_key" ON "AppleAuthAttempt"("stateHash");
CREATE INDEX "AppleAuthAttempt_expiresAt_idx" ON "AppleAuthAttempt"("expiresAt");
CREATE INDEX "AppleAuthAttempt_userId_intent_createdAt_idx" ON "AppleAuthAttempt"("userId", "intent", "createdAt");
CREATE UNIQUE INDEX "AppleAuthorization_userId_key" ON "AppleAuthorization"("userId");
CREATE UNIQUE INDEX "AppleAuthorization_providerAccountId_key" ON "AppleAuthorization"("providerAccountId");
CREATE UNIQUE INDEX "AppleAccountEvent_jti_key" ON "AppleAccountEvent"("jti");
CREATE INDEX "AppleAccountEvent_providerAccountId_eventTime_idx" ON "AppleAccountEvent"("providerAccountId", "eventTime");
CREATE INDEX "AppleAccountEvent_receivedAt_idx" ON "AppleAccountEvent"("receivedAt");
CREATE UNIQUE INDEX "AuthEmailDelivery_actionTokenId_key" ON "AuthEmailDelivery"("actionTokenId");
CREATE INDEX "AuthEmailDelivery_deliveredAt_nextAttemptAt_idx" ON "AuthEmailDelivery"("deliveredAt", "nextAttemptAt");

ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthActionToken" ADD CONSTRAINT "AuthActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthLinkIntent" ADD CONSTRAINT "AuthLinkIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppleAuthAttempt" ADD CONSTRAINT "AppleAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppleAuthorization" ADD CONSTRAINT "AppleAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthEmailDelivery" ADD CONSTRAINT "AuthEmailDelivery_actionTokenId_fkey" FOREIGN KEY ("actionTokenId") REFERENCES "AuthActionToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
