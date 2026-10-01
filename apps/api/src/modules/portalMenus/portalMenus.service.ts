import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PORTAL_MENUS, type PortalMenuKey } from "@white-label/shared-types";
import { AppError } from "../../lib/errors.js";

/** Every toggleable menu with its effective state — an admin's explicit setting, else the shipped default. Public, same access model as GET /nav-labels. */
export async function listPortalMenus(prisma: PrismaClient) {
  const rows = await prisma.portalMenuSetting.findMany();
  const enabledByKey = new Map(rows.map((r) => [r.key, r.enabled]));
  return {
    menus: PORTAL_MENUS.map((m) => ({ key: m.key, path: m.path, label: m.label, defaultEnabled: m.defaultEnabled, enabled: enabledByKey.get(m.key) ?? m.defaultEnabled })),
  };
}

export async function isPortalMenuEnabled(prisma: PrismaClient, key: PortalMenuKey): Promise<boolean> {
  const row = await prisma.portalMenuSetting.findUnique({ where: { key } });
  return row?.enabled ?? PORTAL_MENUS.find((m) => m.key === key)!.defaultEnabled;
}

export async function setPortalMenuEnabled(prisma: PrismaClient, key: PortalMenuKey, enabled: boolean) {
  await prisma.portalMenuSetting.upsert({ where: { key }, update: { enabled }, create: { key, enabled } });
  return (await listPortalMenus(prisma)).menus.find((m) => m.key === key)!;
}

/**
 * preHandler for portal routes behind a menu toggle — hiding the menu alone would leave the feature
 * reachable by calling the API directly.
 */
export function requirePortalMenu(key: PortalMenuKey) {
  return async (request: FastifyRequest) => {
    if (!(await isPortalMenuEnabled(request.server.prisma, key))) {
      throw new AppError("This feature isn't available right now.", 403, "FEATURE_DISABLED");
    }
  };
}
