-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "exchangeRate" TEXT,
ADD COLUMN     "grossAmountMinor" BIGINT,
ADD COLUMN     "localAmount" TEXT,
ADD COLUMN     "localCurrency" TEXT,
ADD COLUMN     "platformFeeMinor" BIGINT NOT NULL DEFAULT 0;

