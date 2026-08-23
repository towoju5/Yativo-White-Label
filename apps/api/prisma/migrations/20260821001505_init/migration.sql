-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CUSTOMER_WALLET', 'PLATFORM_FEE_REVENUE', 'YATIVO_SETTLEMENT', 'YATIVO_CLEARING', 'SUSPENSE_PENDING', 'PLATFORM_RESERVE');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('DEPOSIT', 'PAYOUT', 'SWAP', 'CARD_TOPUP', 'CARD_WITHDRAWAL', 'FEE', 'REFUND', 'CHARGEBACK', 'ADJUSTMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "LedgerTransactionStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerExternalSource" AS ENUM ('YATIVO_WEBHOOK', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'FROZEN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CardStatusEnum" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CardTypeEnum" AS ENUM ('VIRTUAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCH', 'MISMATCH');

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "isFiat" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "status" "LedgerTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "externalSource" "LedgerExternalSource" NOT NULL,
    "externalRef" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "cachedAvailableMinor" BIGINT NOT NULL DEFAULT 0,
    "cachedPendingMinor" BIGINT NOT NULL DEFAULT 0,
    "cacheUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "fullName" TEXT,
    "businessName" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "yativoCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_refresh_tokens" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_refresh_tokens" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "yativoBeneficiaryId" TEXT,
    "details" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "yativoPayoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "yativoCardId" TEXT,
    "network" TEXT NOT NULL DEFAULT 'VISA',
    "last4" TEXT NOT NULL,
    "status" "CardStatusEnum" NOT NULL DEFAULT 'ACTIVE',
    "type" "CardTypeEnum" NOT NULL DEFAULT 'VIRTUAL',
    "currencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'YATIVO',
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_reports" (
    "id" TEXT NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "expectedMinor" BIGINT NOT NULL,
    "actualMinor" BIGINT NOT NULL,
    "deltaMinor" BIGINT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "productName" TEXT NOT NULL DEFAULT 'White Label',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "templateId" TEXT NOT NULL DEFAULT 'nova',
    "primaryColor" TEXT NOT NULL DEFAULT '#6366f1',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0ea5e9',
    "accentColor" TEXT NOT NULL DEFAULT '#22d3ee',
    "supportEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_customerId_idx" ON "accounts"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_type_currencyCode_customerId_key" ON "accounts"("type", "currencyCode", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_reversalOfId_key" ON "ledger_transactions"("reversalOfId");

-- CreateIndex
CREATE INDEX "ledger_transactions_externalRef_idx" ON "ledger_transactions"("externalRef");

-- CreateIndex
CREATE INDEX "ledger_transactions_status_idx" ON "ledger_transactions"("status");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_createdAt_idx" ON "ledger_entries"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_accountId_key" ON "wallets"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_customerId_currencyCode_key" ON "wallets"("customerId", "currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refresh_tokens_tokenHash_key" ON "customer_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_refresh_tokens_customerId_idx" ON "customer_refresh_tokens"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_refresh_tokens_tokenHash_key" ON "staff_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "staff_refresh_tokens_staffUserId_idx" ON "staff_refresh_tokens"("staffUserId");

-- CreateIndex
CREATE INDEX "beneficiaries_customerId_idx" ON "beneficiaries"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_transactionId_key" ON "payouts"("transactionId");

-- CreateIndex
CREATE INDEX "payouts_customerId_idx" ON "payouts"("customerId");

-- CreateIndex
CREATE INDEX "cards_customerId_idx" ON "cards"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_externalEventId_key" ON "webhook_events"("externalEventId");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "webhook_events_processingStatus_idx" ON "webhook_events"("processingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ledger_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_refresh_tokens" ADD CONSTRAINT "staff_refresh_tokens_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_reports" ADD CONSTRAINT "reconciliation_reports_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
