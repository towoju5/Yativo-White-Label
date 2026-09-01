-- CreateEnum
CREATE TYPE "CustomerTeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "customer_team_members" (
    "id" TEXT NOT NULL,
    "businessCustomerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" "CustomerTeamRole" NOT NULL DEFAULT 'MEMBER',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_team_refresh_tokens" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_team_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_team_members_email_key" ON "customer_team_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_team_members_inviteTokenHash_key" ON "customer_team_members"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "customer_team_members_businessCustomerId_idx" ON "customer_team_members"("businessCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_team_refresh_tokens_tokenHash_key" ON "customer_team_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_team_refresh_tokens_memberId_idx" ON "customer_team_refresh_tokens"("memberId");

-- AddForeignKey
ALTER TABLE "customer_team_members" ADD CONSTRAINT "customer_team_members_businessCustomerId_fkey" FOREIGN KEY ("businessCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_team_refresh_tokens" ADD CONSTRAINT "customer_team_refresh_tokens_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "customer_team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
