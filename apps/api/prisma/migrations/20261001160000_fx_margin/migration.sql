-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "fxMarginBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN "fxMarginMinor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN "fxMarginMinor" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "currency_swaps" ADD COLUMN "fxMarginMinor" BIGINT NOT NULL DEFAULT 0;
