-- Additive account-deletion foundation. Existing users, sessions, billing
-- rows, ownership, and entitlements are not modified.
CREATE TYPE "AccountDeletionStatus" AS ENUM (
  'REQUESTED',
  'DEACTIVATED',
  'CLEANUP_PENDING',
  'CLEANUP_PROCESSING',
  'CLEANUP_RETRY',
  'CLEANUP_COMPLETED'
);

CREATE TYPE "DeletionAppleRevocationStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'PROCESSING',
  'RETRY',
  'COMPLETED'
);

CREATE TYPE "DeletionFinancialProvider" AS ENUM ('STRIPE', 'APPLE');

CREATE TYPE "DeletionFinancialRecordKind" AS ENUM (
  'STRIPE_CUSTOMER',
  'STRIPE_SUBSCRIPTION',
  'STRIPE_CHECKOUT_SESSION',
  'APPLE_BILLING_ACCOUNT',
  'APPLE_PURCHASE',
  'APPLE_TRANSACTION'
);

CREATE TYPE "DeletionCommunityResourceKind" AS ENUM (
  'PARK',
  'EXERCISE',
  'FOOD',
  'MEDIA'
);

CREATE TYPE "DeletionReviewStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'RESOLVED',
  'REMOVED_FROM_PUBLIC'
);

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

CREATE TABLE "AccountDeletion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedAt" TIMESTAMP(3),
  "cleanupDeadline" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCategory" TEXT,
  "processingLeaseId" TEXT,
  "processingLeaseExpiresAt" TIMESTAMP(3),
  "appleRevocationStatus" "DeletionAppleRevocationStatus" NOT NULL DEFAULT 'PENDING',
  "appleRevocationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "appleRevocationLastAttemptAt" TIMESTAMP(3),
  "appleRevocationErrorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestrictedFinancialReference" (
  "id" TEXT NOT NULL,
  "accountDeletionId" TEXT NOT NULL,
  "provider" "DeletionFinancialProvider" NOT NULL,
  "recordKind" "DeletionFinancialRecordKind" NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestrictedFinancialReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeletedAppleAccountMapping" (
  "id" TEXT NOT NULL,
  "accountDeletionId" TEXT NOT NULL,
  "appAccountToken" UUID NOT NULL,
  "environment" "AppleEnvironment" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeletedAppleAccountMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeletionCommunityReviewTask" (
  "id" TEXT NOT NULL,
  "accountDeletionId" TEXT NOT NULL,
  "resourceKind" "DeletionCommunityResourceKind" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" "DeletionReviewStatus" NOT NULL DEFAULT 'PENDING',
  "cleanupDeadline" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCategory" TEXT,
  "processingLeaseId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeletionCommunityReviewTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletion_userId_key" ON "AccountDeletion"("userId");
CREATE INDEX "AccountDeletion_status_cleanupDeadline_idx" ON "AccountDeletion"("status", "cleanupDeadline");
CREATE INDEX "AccountDeletion_processingLeaseExpiresAt_idx" ON "AccountDeletion"("processingLeaseExpiresAt");
CREATE INDEX "AccountDeletion_apple_revocation_idx"
  ON "AccountDeletion"("appleRevocationStatus", "appleRevocationLastAttemptAt");

CREATE UNIQUE INDEX "RestrictedFinancialReference_retained_record_key"
  ON "RestrictedFinancialReference"("accountDeletionId", "provider", "recordKind", "sourceRecordId");
CREATE INDEX "RestrictedFinancialReference_source_idx"
  ON "RestrictedFinancialReference"("provider", "recordKind", "sourceRecordId");

CREATE UNIQUE INDEX "DeletedAppleAccountMapping_appAccountToken_key"
  ON "DeletedAppleAccountMapping"("appAccountToken");
CREATE INDEX "DeletedAppleAccountMapping_accountDeletionId_idx"
  ON "DeletedAppleAccountMapping"("accountDeletionId");

CREATE UNIQUE INDEX "DeletionCommunityReviewTask_resource_key"
  ON "DeletionCommunityReviewTask"("accountDeletionId", "resourceKind", "resourceId");
CREATE INDEX "DeletionCommunityReviewTask_status_cleanupDeadline_idx"
  ON "DeletionCommunityReviewTask"("status", "cleanupDeadline");
CREATE INDEX "DeletionCommunityReviewTask_leaseExpiresAt_idx"
  ON "DeletionCommunityReviewTask"("leaseExpiresAt");

ALTER TABLE "AccountDeletion"
  ADD CONSTRAINT "AccountDeletion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestrictedFinancialReference"
  ADD CONSTRAINT "RestrictedFinancialReference_accountDeletionId_fkey"
  FOREIGN KEY ("accountDeletionId") REFERENCES "AccountDeletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeletedAppleAccountMapping"
  ADD CONSTRAINT "DeletedAppleAccountMapping_accountDeletionId_fkey"
  FOREIGN KEY ("accountDeletionId") REFERENCES "AccountDeletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeletionCommunityReviewTask"
  ADD CONSTRAINT "DeletionCommunityReviewTask_accountDeletionId_fkey"
  FOREIGN KEY ("accountDeletionId") REFERENCES "AccountDeletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
