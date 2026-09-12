-- AlterTable
ALTER TABLE "customer_refresh_tokens" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "customer_audit_logs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_limits" (
    "customerId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "dailyLimitMinor" BIGINT,
    "monthlyLimitMinor" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_limits_pkey" PRIMARY KEY ("customerId","currencyCode")
);

-- CreateTable
CREATE TABLE "platform_limits_defaults" (
    "currencyCode" TEXT NOT NULL,
    "dailyLimitMinor" BIGINT,
    "monthlyLimitMinor" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_limits_defaults_pkey" PRIMARY KEY ("currencyCode")
);

-- CreateIndex
CREATE INDEX "customer_audit_logs_customerId_createdAt_idx" ON "customer_audit_logs"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "customer_audit_logs" ADD CONSTRAINT "customer_audit_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_limits" ADD CONSTRAINT "customer_limits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

