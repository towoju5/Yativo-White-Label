-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_inviteTokenHash_key" ON "staff_users"("inviteTokenHash");

