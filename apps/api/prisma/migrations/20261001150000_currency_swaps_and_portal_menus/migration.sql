-- AlterEnum
ALTER TYPE "PricingServiceType" ADD VALUE 'CURRENCY_SWAP';

-- CreateTable
CREATE TABLE "portal_menu_settings" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_menu_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "currency_swaps" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromCurrencyCode" CHAR(3) NOT NULL,
    "toCurrencyCode" CHAR(3) NOT NULL,
    "fromAmountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "toAmountMinor" BIGINT NOT NULL,
    "rate" TEXT NOT NULL,
    "rateUpdatedAt" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currency_swaps_transactionId_key" ON "currency_swaps"("transactionId");
CREATE INDEX "currency_swaps_customerId_createdAt_idx" ON "currency_swaps"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "currency_swaps" ADD CONSTRAINT "currency_swaps_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
