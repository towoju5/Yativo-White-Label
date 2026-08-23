-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "kycSubmissionId" TEXT,
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;
