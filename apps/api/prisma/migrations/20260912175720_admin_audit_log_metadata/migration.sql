-- AlterTable
ALTER TABLE "admin_audit_logs" ADD COLUMN     "metadata" JSONB;

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs"("target");

