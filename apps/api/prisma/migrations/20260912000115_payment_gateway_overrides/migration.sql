-- CreateEnum
CREATE TYPE "PaymentGatewayKind" AS ENUM ('PAYIN', 'PAYOUT');

-- CreateTable
CREATE TABLE "payment_gateway_overrides" (
    "kind" "PaymentGatewayKind" NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_overrides_pkey" PRIMARY KEY ("kind","gatewayId")
);

