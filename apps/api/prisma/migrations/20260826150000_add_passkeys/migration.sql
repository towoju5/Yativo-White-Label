-- CreateTable
CREATE TABLE "customer_passkeys" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "customer_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_passkeys" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "staff_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_passkeys_credentialId_key" ON "customer_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "customer_passkeys_customerId_idx" ON "customer_passkeys"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_passkeys_credentialId_key" ON "staff_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "staff_passkeys_staffUserId_idx" ON "staff_passkeys"("staffUserId");

-- AddForeignKey
ALTER TABLE "customer_passkeys" ADD CONSTRAINT "customer_passkeys_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_passkeys" ADD CONSTRAINT "staff_passkeys_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
