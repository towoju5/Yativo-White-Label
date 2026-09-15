-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN "transactionId" TEXT;

-- CreateIndex
CREATE INDEX "support_tickets_transactionId_idx" ON "support_tickets"("transactionId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
