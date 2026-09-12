import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PrismaClient, BrandingConfig } from "@prisma/client";
import type { UpdateBrandingInput } from "@white-label/shared-types";

// Local reference file only — the database row is the source of truth. Lets an admin who
// forgot the current admin login path find it on disk instead of being locked out entirely.
const ADMIN_LOGIN_PATH_FILE = fileURLToPath(new URL("../../../admin-login-path.txt", import.meta.url));

async function syncAdminLoginPathFile(adminLoginPath: string) {
  await writeFile(ADMIN_LOGIN_PATH_FILE, `${adminLoginPath}\n`, "utf8");
}

export function brandingToDto(config: BrandingConfig) {
  return {
    productName: config.productName,
    logoUrl: config.logoUrl,
    logoUrlDark: config.logoUrlDark,
    logoInvertOnDark: config.logoInvertOnDark,
    faviconUrl: config.faviconUrl,
    stampUrl: config.stampUrl,
    templateId: config.templateId as "nova" | "atlas",
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    accentColor: config.accentColor,
    supportEmail: config.supportEmail,
    adminLoginPath: config.adminLoginPath,
    liveChatEnabled: config.liveChatEnabled,
    liveChatCode: config.liveChatCode,
    statementFooterText: config.statementFooterText,
    pwaShortName: config.pwaShortName,
    pwaBackgroundColor: config.pwaBackgroundColor,
    updatedAt: config.updatedAt.toISOString(),
  };
}

/** Create-on-read: the singleton row is seeded with schema defaults if missing. */
export async function getBranding(prisma: PrismaClient) {
  const config = await prisma.brandingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await syncAdminLoginPathFile(config.adminLoginPath);
  return brandingToDto(config);
}

export async function updateBranding(prisma: PrismaClient, input: UpdateBrandingInput) {
  const config = await prisma.brandingConfig.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, ...input },
  });
  if (input.adminLoginPath !== undefined) {
    await syncAdminLoginPathFile(config.adminLoginPath);
  }
  return brandingToDto(config);
}
