-- CreateEnum
CREATE TYPE "YativoCustomerMode" AS ENUM ('PER_CUSTOMER', 'POOLED');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "pooledYativoCustomerId" TEXT,
ADD COLUMN     "yativoCustomerMode" "YativoCustomerMode" NOT NULL DEFAULT 'PER_CUSTOMER';

-- CreateTable
CREATE TABLE "virtual_accounts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "yativoAccountId" TEXT NOT NULL,
    "identifiers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "virtual_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "virtual_accounts_customerId_idx" ON "virtual_accounts"("customerId");

-- AddForeignKey
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
