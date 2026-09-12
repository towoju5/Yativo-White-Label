import type { PrismaClient } from "@prisma/client";
import geoip from "geoip-lite";

export type LoginPrincipalKind = "customer" | "staff";

function countryFor(ip?: string): string | null {
  if (!ip) return null;
  return geoip.lookup(ip)?.country ?? null;
}

/**
 * True when this login should be treated as coming from a location this principal has never
 * signed in from before — the trigger for requiring step-up verification. Deliberately permissive
 * on missing data: an IP that can't be geolocated (localhost, a private range, a lookup miss)
 * never blocks a login, and a principal's very first successful login ever has nothing to compare
 * against yet, so it's never flagged as "new" (there's no prior location to have deviated from).
 */
export async function isNewLoginLocation(prisma: PrismaClient, principalType: LoginPrincipalKind, principalId: string, ip?: string): Promise<boolean> {
  const country = countryFor(ip);
  if (!country) return false;
  const hasAnyKnownLocation = await prisma.knownLoginLocation.findFirst({ where: { principalType, principalId } });
  if (!hasAnyKnownLocation) return false;
  const seenThisCountry = await prisma.knownLoginLocation.findUnique({
    where: { principalType_principalId_country: { principalType, principalId, country } },
  });
  return !seenThisCountry;
}

/** Marks this IP's country as known for this principal — call on every successful login (not just new-location ones) so the known-location set actually grows over time. */
export async function recordLoginLocation(prisma: PrismaClient, principalType: LoginPrincipalKind, principalId: string, ip?: string): Promise<void> {
  const country = countryFor(ip);
  if (!country) return;
  await prisma.knownLoginLocation.upsert({
    where: { principalType_principalId_country: { principalType, principalId, country } },
    create: { principalType, principalId, country },
    update: { lastSeenAt: new Date() },
  });
}
