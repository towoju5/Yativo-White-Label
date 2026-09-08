-- CreateEnum
CREATE TYPE "BusinessSpendCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- AlterTable
ALTER TABLE "platform_settings" ALTER COLUMN "kycRequiredServices" SET DEFAULT ARRAY['DEPOSIT', 'VIRTUAL_ACCOUNT', 'PAYOUT', 'CARD', 'BENEFICIARY', 'CRYPTO_WALLET', 'BUSINESS_SPEND_CARD']::"KycRequiredService"[];

-- CreateTable
CREATE TABLE "business_spend_cards" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "yativoCardId" TEXT NOT NULL,
    "issuanceType" "CardTypeEnum" NOT NULL DEFAULT 'VIRTUAL',
    "status" "BusinessSpendCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "maskedPan" TEXT,
    "expirationDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_spend_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_spend_cards_customerId_idx" ON "business_spend_cards"("customerId");

-- AddForeignKey
ALTER TABLE "business_spend_cards" ADD CONSTRAINT "business_spend_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
