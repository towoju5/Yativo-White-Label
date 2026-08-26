import type { PrismaClient, BrandingConfig } from "@prisma/client";
import type { UpdateBrandingInput } from "@white-label/shared-types";

export function brandingToDto(config: BrandingConfig) {
  return {
    productName: config.productName,
    logoUrl: config.logoUrl,
    faviconUrl: config.faviconUrl,
    templateId: config.templateId as "nova" | "atlas",
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    accentColor: config.accentColor,
    supportEmail: config.supportEmail,
    adminLoginPath: config.adminLoginPath,
    updatedAt: config.updatedAt.toISOString(),
  };
}

/** Create-on-read: the singleton row is seeded with schema defaults if missing. */
export async function getBranding(prisma: PrismaClient) {
  const config = await prisma.brandingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return brandingToDto(config);
}

export async function updateBranding(prisma: PrismaClient, input: UpdateBrandingInput) {
  const config = await prisma.brandingConfig.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, ...input },
  });
  return brandingToDto(config);
}
