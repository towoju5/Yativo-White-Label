-- CreateEnum
CREATE TYPE "CurrencySyncFrequency" AS ENUM ('DAILY', 'TWICE_DAILY');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "currencySyncFrequency" "CurrencySyncFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN "lastCurrencySyncAt" TIMESTAMP(3);
