import type { PrismaClient, PaymentGatewayKind } from "@prisma/client";

/** Drops any gateway an admin has explicitly disabled (see PaymentGatewayOverride's doc comment) — independent of whatever Yativo itself reports as active. */
export async function filterEnabledGateways<T extends { gatewayId: string }>(
  prisma: PrismaClient,
  kind: PaymentGatewayKind,
  items: T[],
): Promise<T[]> {
  if (items.length === 0) return items;
  const overrides = await prisma.paymentGatewayOverride.findMany({
    where: { kind, gatewayId: { in: items.map((i) => i.gatewayId) } },
    select: { gatewayId: true },
  });
  const disabled = new Set(overrides.map((o) => o.gatewayId));
  return items.filter((i) => !disabled.has(i.gatewayId));
}

export async function setGatewayEnabled(prisma: PrismaClient, kind: PaymentGatewayKind, gatewayId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    await prisma.paymentGatewayOverride.deleteMany({ where: { kind, gatewayId } });
  } else {
    await prisma.paymentGatewayOverride.upsert({
      where: { kind_gatewayId: { kind, gatewayId } },
      update: {},
      create: { kind, gatewayId },
    });
  }
}

export async function listDisabledGatewayIds(prisma: PrismaClient, kind: PaymentGatewayKind): Promise<Set<string>> {
  const overrides = await prisma.paymentGatewayOverride.findMany({ where: { kind }, select: { gatewayId: true } });
  return new Set(overrides.map((o) => o.gatewayId));
}
