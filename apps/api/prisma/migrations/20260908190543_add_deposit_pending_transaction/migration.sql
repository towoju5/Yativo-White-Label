-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "transactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "deposits_transactionId_key" ON "deposits"("transactionId");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
