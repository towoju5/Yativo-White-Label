-- AlterTable
ALTER TABLE "staff_refresh_tokens" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "twoFactorBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "known_login_locations" (
    "id" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "known_login_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "known_login_locations_principalType_principalId_idx" ON "known_login_locations"("principalType", "principalId");

-- CreateIndex
CREATE UNIQUE INDEX "known_login_locations_principalType_principalId_country_key" ON "known_login_locations"("principalType", "principalId", "country");

