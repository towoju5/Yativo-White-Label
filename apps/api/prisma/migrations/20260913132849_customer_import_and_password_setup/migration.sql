-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('SIGNUP', 'IMPORTED');

-- CreateEnum
CREATE TYPE "CustomerImportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "requiresPasswordSetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "CustomerSource" NOT NULL DEFAULT 'SIGNUP',
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "customer_import_runs" (
    "id" TEXT NOT NULL,
    "status" "CustomerImportStatus" NOT NULL DEFAULT 'RUNNING',
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "triggeredById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "customer_import_runs_pkey" PRIMARY KEY ("id")
);

