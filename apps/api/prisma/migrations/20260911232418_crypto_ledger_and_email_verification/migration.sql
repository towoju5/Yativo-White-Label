-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationTokenHash" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "crypto_wallets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_deposits" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crypto_wallets_customerId_idx" ON "crypto_wallets"("customerId");

-- CreateIndex
CREATE INDEX "crypto_wallets_address_idx" ON "crypto_wallets"("address");

-- CreateIndex
CREATE INDEX "crypto_deposits_customerId_idx" ON "crypto_deposits"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_emailVerificationTokenHash_key" ON "customers"("emailVerificationTokenHash");

-- AddForeignKey
ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_deposits" ADD CONSTRAINT "crypto_deposits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

