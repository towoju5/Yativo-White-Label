-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_passwordResetTokenHash_key" ON "customers"("passwordResetTokenHash");

