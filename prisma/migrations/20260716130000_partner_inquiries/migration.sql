-- CreateTable
CREATE TABLE "PartnerInquiry" (
    "id" SERIAL NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cityCountry" TEXT NOT NULL,
    "proposedReward" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerInquiry_email_idx" ON "PartnerInquiry"("email");

-- CreateIndex
CREATE INDEX "PartnerInquiry_createdAt_idx" ON "PartnerInquiry"("createdAt");
