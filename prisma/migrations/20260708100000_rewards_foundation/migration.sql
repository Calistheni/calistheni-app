-- CreateEnum
CREATE TYPE "RewardTransactionType" AS ENUM ('WORKOUT_COMPLETED', 'STREAK', 'PARK_APPROVED', 'PHOTO_APPROVED', 'CHALLENGE', 'ADMIN', 'REDEMPTION');

-- CreateEnum
CREATE TYPE "RewardRedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "rewardPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RewardTransaction" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RewardTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" INTEGER NOT NULL,
    "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardTransaction_userId_createdAt_idx" ON "RewardTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardTransaction_type_idx" ON "RewardTransaction"("type");

-- CreateIndex
CREATE INDEX "RewardTransaction_referenceId_idx" ON "RewardTransaction"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_title_partnerName_key" ON "Reward"("title", "partnerName");

-- CreateIndex
CREATE INDEX "Reward_active_idx" ON "Reward"("active");

-- CreateIndex
CREATE INDEX "Reward_pointsCost_idx" ON "Reward"("pointsCost");

-- CreateIndex
CREATE INDEX "RewardRedemption_userId_createdAt_idx" ON "RewardRedemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardRedemption_rewardId_idx" ON "RewardRedemption"("rewardId");

-- CreateIndex
CREATE INDEX "RewardRedemption_status_idx" ON "RewardRedemption"("status");

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
