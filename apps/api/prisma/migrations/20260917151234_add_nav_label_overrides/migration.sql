-- CreateTable
CREATE TABLE "nav_label_overrides" (
    "key" TEXT NOT NULL,
    "translations" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nav_label_overrides_pkey" PRIMARY KEY ("key")
);
