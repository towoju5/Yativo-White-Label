-- CreateEnum
CREATE TYPE "DemoSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DESTROYING', 'DESTROYED', 'FAILED');

-- CreateTable
CREATE TABLE "demo_sessions" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "status" "DemoSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "destroyedAt" TIMESTAMP(3),
    "createdByStaffUserId" TEXT NOT NULL,
    "demoUserId" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_uuid_key" ON "demo_sessions"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_tokenHash_key" ON "demo_sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_databaseName_key" ON "demo_sessions"("databaseName");

-- CreateIndex
CREATE INDEX "demo_sessions_status_expiresAt_idx" ON "demo_sessions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

