-- Additive Apple In-App Purchase persistence. Existing Stripe subscription
-- rows and entitlement fields are deliberately untouched.
CREATE TYPE "AppleEnvironment" AS ENUM ('PRODUCTION', 'SANDBOX');
CREATE TYPE "AppleProductKind" AS ENUM ('SUBSCRIPTION', 'LIFETIME');
CREATE TYPE "ApplePurchaseState" AS ENUM ('ACTIVE', 'GRACE_PERIOD', 'BILLING_RETRY', 'EXPIRED', 'REVOKED');
CREATE TYPE "AppleOwnershipType" AS ENUM ('PURCHASED', 'FAMILY_SHARED');
CREATE TYPE "AppleNotificationProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

CREATE TABLE "AppleBillingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appAccountToken" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleBillingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplePurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" "AppleEnvironment" NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "latestTransactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productKind" "AppleProductKind" NOT NULL,
    "state" "ApplePurchaseState" NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "gracePeriodExpiresAt" TIMESTAMP(3),
    "autoRenewStatus" BOOLEAN,
    "revokedAt" TIMESTAMP(3),
    "latestSignedDate" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplePurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" "AppleEnvironment" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productKind" "AppleProductKind" NOT NULL,
    "appAccountToken" UUID NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "expiresDate" TIMESTAMP(3),
    "revocationDate" TIMESTAMP(3),
    "ownershipType" "AppleOwnershipType" NOT NULL,
    "signedDate" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppleServerNotification" (
    "id" TEXT NOT NULL,
    "notificationUUID" TEXT NOT NULL,
    "environment" "AppleEnvironment" NOT NULL,
    "notificationType" TEXT NOT NULL,
    "subtype" TEXT,
    "signedDate" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processingStatus" "AppleNotificationProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleServerNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppleBillingAccount_userId_key" ON "AppleBillingAccount"("userId");
CREATE UNIQUE INDEX "AppleBillingAccount_appAccountToken_key" ON "AppleBillingAccount"("appAccountToken");
CREATE UNIQUE INDEX "ApplePurchase_environment_originalTransactionId_key" ON "ApplePurchase"("environment", "originalTransactionId");
CREATE UNIQUE INDEX "ApplePurchase_environment_latestTransactionId_key" ON "ApplePurchase"("environment", "latestTransactionId");
CREATE INDEX "ApplePurchase_userId_idx" ON "ApplePurchase"("userId");
CREATE INDEX "ApplePurchase_state_idx" ON "ApplePurchase"("state");
CREATE INDEX "ApplePurchase_expiresAt_idx" ON "ApplePurchase"("expiresAt");
CREATE INDEX "ApplePurchase_environment_idx" ON "ApplePurchase"("environment");
CREATE INDEX "ApplePurchase_productId_idx" ON "ApplePurchase"("productId");
CREATE UNIQUE INDEX "AppleTransaction_environment_transactionId_key" ON "AppleTransaction"("environment", "transactionId");
CREATE INDEX "AppleTransaction_environment_originalTransactionId_idx" ON "AppleTransaction"("environment", "originalTransactionId");
CREATE INDEX "AppleTransaction_userId_idx" ON "AppleTransaction"("userId");
CREATE UNIQUE INDEX "AppleServerNotification_notificationUUID_key" ON "AppleServerNotification"("notificationUUID");
CREATE INDEX "AppleServerNotification_environment_idx" ON "AppleServerNotification"("environment");
CREATE INDEX "AppleServerNotification_processingStatus_idx" ON "AppleServerNotification"("processingStatus");
CREATE INDEX "AppleServerNotification_signedDate_idx" ON "AppleServerNotification"("signedDate");

ALTER TABLE "AppleBillingAccount" ADD CONSTRAINT "AppleBillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplePurchase" ADD CONSTRAINT "ApplePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppleTransaction" ADD CONSTRAINT "AppleTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
