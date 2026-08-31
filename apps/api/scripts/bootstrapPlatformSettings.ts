import { PrismaClient } from "@prisma/client";
import { bootstrapPlatformData } from "../src/lib/bootstrapPlatformData.js";

const prisma = new PrismaClient();

/**
 * The safe half of prisma/seed.ts — currencies, PlatformSettings, and BrandingConfig only. Unlike
 * the full seed script, this never calls Yativo and never creates a staff/customer account, so
 * it's safe to run against a real (YATIVO_MODE=sandbox/live) production database that was only
 * ever migrated, never seeded.
 */
async function main() {
  await bootstrapPlatformData(prisma);
  console.log("Platform settings, default currencies, and branding are in place.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
