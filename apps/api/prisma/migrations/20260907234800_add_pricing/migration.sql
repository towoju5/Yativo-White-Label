-- CreateEnum
CREATE TYPE "PricingServiceType" AS ENUM ('PAYIN', 'PAYOUT', 'VIRTUAL_ACCOUNT_DEPOSIT', 'CARD_CREATE', 'CARD_FUND', 'CARD_WITHDRAW');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('FIXED', 'PERCENTAGE', 'COMBINED');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('STANDALONE', 'MARKUP');

-- CreateTable
CREATE TABLE "pricing_defaults" (
    "service" "PricingServiceType" NOT NULL,
    "feeType" "FeeType" NOT NULL DEFAULT 'FIXED',
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'STANDALONE',
    "fixedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "percentageBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_defaults_pkey" PRIMARY KEY ("service")
);

-- CreateTable
CREATE TABLE "pricing_overrides" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "service" "PricingServiceType" NOT NULL,
    "feeType" "FeeType" NOT NULL DEFAULT 'FIXED',
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'STANDALONE',
    "fixedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "percentageBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "yativoDepositId" TEXT NOT NULL,
    "yativoFeeMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_overrides_customerId_service_key" ON "pricing_overrides"("customerId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_yativoDepositId_key" ON "deposits"("yativoDepositId");

-- AddForeignKey
ALTER TABLE "pricing_overrides" ADD CONSTRAINT "pricing_overrides_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
