ALTER TABLE "customers" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "customers" ADD COLUMN "deletionReason" TEXT;

CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");
