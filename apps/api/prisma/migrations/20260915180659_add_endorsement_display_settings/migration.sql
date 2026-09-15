-- CreateTable
CREATE TABLE "endorsement_display_settings" (
    "service" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "endorsement_display_settings_pkey" PRIMARY KEY ("service")
);
