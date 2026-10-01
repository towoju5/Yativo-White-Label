-- AlterEnum
ALTER TYPE "EmailNotificationType" ADD VALUE 'TRANSFER_SENT';
ALTER TYPE "EmailNotificationType" ADD VALUE 'TRANSFER_RECEIVED';

-- AlterEnum
ALTER TYPE "PricingServiceType" ADD VALUE 'INTERNAL_TRANSFER';

-- AlterTable: volatile default is evaluated per existing row, so every current customer is
-- backfilled with its own id in the same statement.
ALTER TABLE "customers" ADD COLUMN "publicId" TEXT NOT NULL DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 10));

-- CreateIndex
CREATE UNIQUE INDEX "customers_publicId_key" ON "customers"("publicId");

-- CreateTable
CREATE TABLE "internal_transfers" (
    "id" TEXT NOT NULL,
    "senderCustomerId" TEXT NOT NULL,
    "recipientCustomerId" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "lookupMethod" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_transfers_transactionId_key" ON "internal_transfers"("transactionId");
CREATE INDEX "internal_transfers_senderCustomerId_createdAt_idx" ON "internal_transfers"("senderCustomerId", "createdAt");
CREATE INDEX "internal_transfers_recipientCustomerId_createdAt_idx" ON "internal_transfers"("recipientCustomerId", "createdAt");

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_senderCustomerId_fkey" FOREIGN KEY ("senderCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_recipientCustomerId_fkey" FOREIGN KEY ("recipientCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
