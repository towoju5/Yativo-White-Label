-- DropForeignKey
ALTER TABLE "demo_sessions" DROP CONSTRAINT "demo_sessions_createdByStaffUserId_fkey";

-- AlterTable
ALTER TABLE "demo_sessions" ALTER COLUMN "createdByStaffUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
