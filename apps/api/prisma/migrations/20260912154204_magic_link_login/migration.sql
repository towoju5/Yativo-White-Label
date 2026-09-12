-- CreateEnum
CREATE TYPE "CustomerLoginMethod" AS ENUM ('PASSWORD', 'MAGIC_LINK');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "magicLinkExpiresAt" TIMESTAMP(3),
ADD COLUMN     "magicLinkTokenHash" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "customerLoginMethod" "CustomerLoginMethod" NOT NULL DEFAULT 'PASSWORD';

-- CreateIndex
CREATE UNIQUE INDEX "customers_magicLinkTokenHash_key" ON "customers"("magicLinkTokenHash");

