-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "kycContinueExpiresAt" TIMESTAMP(3),
ADD COLUMN     "kycContinueTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_kycContinueTokenHash_key" ON "customers"("kycContinueTokenHash");
