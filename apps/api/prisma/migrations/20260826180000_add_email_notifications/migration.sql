-- CreateEnum
CREATE TYPE "EmailNotificationType" AS ENUM ('WELCOME', 'KYC_APPROVED', 'KYC_REJECTED', 'DEPOSIT_RECEIVED', 'PAYOUT_CREATED', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED', 'CARD_ISSUED', 'CARD_FROZEN', 'CARD_UNFROZEN', 'CARD_TERMINATED', 'CARD_TRANSACTION', 'SWAP_COMPLETED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'PASSKEY_ADDED', 'PASSKEY_REMOVED', 'BENEFICIARY_ADDED');

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "disabledTypes" "EmailNotificationType"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "type" "EmailNotificationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("type")
);
