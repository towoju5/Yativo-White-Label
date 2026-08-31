-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "balanceAfterMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "balanceBeforeMinor" BIGINT NOT NULL DEFAULT 0;
