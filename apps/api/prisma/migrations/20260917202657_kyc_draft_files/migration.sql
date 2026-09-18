-- CreateTable
CREATE TABLE "kyc_draft_files" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_draft_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_draft_files_customerId_fieldPath_key" ON "kyc_draft_files"("customerId", "fieldPath");

-- AddForeignKey
ALTER TABLE "kyc_draft_files" ADD CONSTRAINT "kyc_draft_files_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
