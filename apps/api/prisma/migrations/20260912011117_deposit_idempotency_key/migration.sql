-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "yativoIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "deposits_yativoIdempotencyKey_key" ON "deposits"("yativoIdempotencyKey");

