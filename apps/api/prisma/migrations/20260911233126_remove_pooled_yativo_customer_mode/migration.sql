-- AlterTable
ALTER TABLE "platform_settings" DROP COLUMN "pooledYativoCustomerId",
DROP COLUMN "yativoCustomerMode";

-- DropEnum
DROP TYPE "YativoCustomerMode";

