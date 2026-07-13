-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'PRO_LIFETIME';

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "lifetimePurchasedAt" TIMESTAMP(3),
ADD COLUMN "stripeLifetimeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeLifetimeCheckoutSessionId_key"
ON "Subscription"("stripeLifetimeCheckoutSessionId");
