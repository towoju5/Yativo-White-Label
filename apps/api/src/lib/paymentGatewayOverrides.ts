import type { PrismaClient, PaymentGatewayKind } from "@prisma/client";

// Rails this platform doesn't offer regardless of admin overrides — matched against Yativo's
// free-form methodName since gateways have no stable name enum (see paymentMethods.ts's SDK
// schema). Case-insensitive substring match against whatever the live method name is.
const HIDDEN_GATEWAY_NAME_PATTERNS = [/sepa/i];

function isHiddenGatewayName(methodName: string): boolean {
  return HIDDEN_GATEWAY_NAME_PATTERNS.some((pattern) => pattern.test(methodName));
}

/** Drops any gateway an admin has explicitly disabled (see PaymentGatewayOverride's doc comment), plus any rail this platform hides outright (e.g. SEPA) — independent of whatever Yativo itself reports as active. */
export async function filterEnabledGateways<T extends { gatewayId: string; methodName: string }>(
  prisma: PrismaClient,
  kind: PaymentGatewayKind,
  items: T[],
): Promise<T[]> {
  const named = items.filter((i) => !isHiddenGatewayName(i.methodName));
  if (named.length === 0) return named;
  const overrides = await prisma.paymentGatewayOverride.findMany({
    where: { kind, gatewayId: { in: named.map((i) => i.gatewayId) } },
    select: { gatewayId: true },
  });
  const disabled = new Set(overrides.map((o) => o.gatewayId));
  return named.filter((i) => !disabled.has(i.gatewayId));
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
