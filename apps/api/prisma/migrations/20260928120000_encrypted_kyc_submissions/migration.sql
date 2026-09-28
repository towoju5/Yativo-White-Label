-- CreateTable
CREATE TABLE "encrypted_kyc_submissions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "action" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encrypted_kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encrypted_kyc_submissions_customerId_createdAt_idx" ON "encrypted_kyc_submissions"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "encrypted_kyc_submissions" ADD CONSTRAINT "encrypted_kyc_submissions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
