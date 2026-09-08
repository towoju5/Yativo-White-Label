import type { PrismaClient, PricingServiceType, FeeType, PricingMode } from "@prisma/client";
import type { UpdatePricingDefaultInput, UpsertPricingOverrideInput } from "@white-label/shared-types";
import { NotFoundError } from "../../lib/errors.js";

type Rule = { feeType: FeeType; pricingMode: PricingMode; fixedAmountMinor: bigint; percentageBps: number };

function ruleToDto(rule: Rule & { service: PricingServiceType; updatedAt: Date }) {
  return {
    service: rule.service,
    feeType: rule.feeType,
    pricingMode: rule.pricingMode,
    fixedAmountMinor: rule.fixedAmountMinor.toString(),
    percentageBps: rule.percentageBps,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export async function listPricingDefaults(prisma: PrismaClient) {
  const defaults = await prisma.pricingDefault.findMany({ orderBy: { service: "asc" } });
  return defaults.map(ruleToDto);
}

export async function updatePricingDefault(prisma: PrismaClient, service: PricingServiceType, input: UpdatePricingDefaultInput) {
  const updated = await prisma.pricingDefault.update({
    where: { service },
    data: { feeType: input.feeType, pricingMode: input.pricingMode, fixedAmountMinor: BigInt(input.fixedAmountMinor), percentageBps: input.percentageBps },
  });
  return ruleToDto(updated);
}

/** All 6 services for a customer, each tagged with whether it's their own override or the platform default falling through. */
export async function listCustomerPricing(prisma: PrismaClient, customerId: string) {
  const [defaults, overrides] = await Promise.all([
    prisma.pricingDefault.findMany({ orderBy: { service: "asc" } }),
    prisma.pricingOverride.findMany({ where: { customerId } }),
  ]);
  const overrideByService = new Map(overrides.map((o) => [o.service, o]));
  return defaults.map((d) => {
    const override = overrideByService.get(d.service);
    const rule = override ?? d;
    return { ...ruleToDto(rule), source: override ? ("OVERRIDE" as const) : ("DEFAULT" as const) };
  });
}

export async function upsertPricingOverride(prisma: PrismaClient, customerId: string, service: PricingServiceType, input: UpsertPricingOverrideInput) {
  const data = { feeType: input.feeType, pricingMode: input.pricingMode, fixedAmountMinor: BigInt(input.fixedAmountMinor), percentageBps: input.percentageBps };
  const override = await prisma.pricingOverride.upsert({
    where: { customerId_service: { customerId, service } },
    update: data,
    create: { customerId, service, ...data },
  });
  return { ...ruleToDto(override), source: "OVERRIDE" as const };
}

export async function deletePricingOverride(prisma: PrismaClient, customerId: string, service: PricingServiceType) {
  await prisma.pricingOverride.deleteMany({ where: { customerId, service } });
  const fallback = await prisma.pricingDefault.findUnique({ where: { service } });
  if (!fallback) throw new NotFoundError("Pricing default");
  return { ...ruleToDto(fallback), source: "DEFAULT" as const };
}

function computeOwnFee(rule: Rule, amountMinor: bigint): bigint {
  const percentagePortion = (amountMinor * BigInt(rule.percentageBps)) / 10000n;
  switch (rule.feeType) {
    case "FIXED":
      return rule.fixedAmountMinor;
    case "PERCENTAGE":
      return percentagePortion;
    case "COMBINED":
      return rule.fixedAmountMinor + percentagePortion;
  }
}

async function resolveEffectiveRule(prisma: PrismaClient, service: PricingServiceType, customerId: string): Promise<Rule> {
  const override = await prisma.pricingOverride.findUnique({ where: { customerId_service: { customerId, service } } });
  if (override) return override;
  const fallback = await prisma.pricingDefault.findUnique({ where: { service } });
  if (!fallback) throw new NotFoundError("Pricing default");
  return fallback;
}

/**
 * The fee to actually charge for one transaction. `upstreamFeeMinor` is whatever Yativo itself
 * reported as its own cost for this transaction (0 when it reports none — most services don't).
 * In MARKUP mode the platform fee is added on top of that; in STANDALONE mode (the default)
 * upstreamFeeMinor is ignored entirely and only the platform's own fee is charged.
 */
export async function getEffectiveFee(
  prisma: PrismaClient,
  service: PricingServiceType,
  customerId: string,
  amountMinor: bigint,
  upstreamFeeMinor: bigint = 0n,
): Promise<bigint> {
  const rule = await resolveEffectiveRule(prisma, service, customerId);
  const ownFee = computeOwnFee(rule, amountMinor);
  return rule.pricingMode === "MARKUP" ? upstreamFeeMinor + ownFee : ownFee;
}
