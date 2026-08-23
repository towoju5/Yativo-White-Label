-- CreateEnum
CREATE TYPE "WalletCurrencyMode" AS ENUM ('DEFAULT_ONLY', 'SELF_SERVICE', 'ALL_AUTOMATIC');

-- AlterTable
ALTER TABLE "currencies" ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isEnabledForCustomers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "symbol" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "twoFactorBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "walletCurrencyMode" "WalletCurrencyMode" NOT NULL DEFAULT 'DEFAULT_ONLY',
    "defaultCurrencyCode" CHAR(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_defaultCurrencyCode_fkey" FOREIGN KEY ("defaultCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
