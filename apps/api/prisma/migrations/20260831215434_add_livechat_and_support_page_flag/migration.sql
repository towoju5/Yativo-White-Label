-- AlterTable
ALTER TABLE "branding_config" ADD COLUMN     "liveChatCode" TEXT,
ADD COLUMN     "liveChatEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notification_settings" ALTER COLUMN "disabledTypes" SET DEFAULT ARRAY[]::"EmailNotificationType"[];

-- AlterTable
ALTER TABLE "static_pages" ADD COLUMN     "showInSupport" BOOLEAN NOT NULL DEFAULT false;
