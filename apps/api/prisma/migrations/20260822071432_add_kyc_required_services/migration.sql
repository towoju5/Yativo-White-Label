-- CreateEnum
CREATE TYPE "KycRequiredService" AS ENUM ('DEPOSIT', 'VIRTUAL_ACCOUNT', 'PAYOUT', 'CARD', 'BENEFICIARY', 'CRYPTO_WALLET');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "kycRequiredServices" "KycRequiredService"[] DEFAULT ARRAY['DEPOSIT', 'VIRTUAL_ACCOUNT', 'PAYOUT', 'CARD', 'BENEFICIARY', 'CRYPTO_WALLET']::"KycRequiredService"[];
