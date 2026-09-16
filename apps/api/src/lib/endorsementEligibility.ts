import type { Customer, PrismaClient } from "@prisma/client";
import { yativoClient } from "./yativoClient.js";
import { ensureYativoCustomer } from "./ensureYativoCustomer.js";
import { AppError } from "./errors.js";

export type EndorsementEligibility = {
  eligible: boolean;
  endorsementStatus: string | null;
  hostedKycUrl: string | null;
};

/**
 * Yativo now pairs an optional `endorsement` service slug with every virtual-account currency,
 * deposit gateway, and payout gateway — null means the rail needs no special approval, a string
 * names the service the customer's endorsement checklist must show "approved" for. This fetches
 * that checklist once and returns a resolver so a whole list of gateways/currencies can be
 * checked against it without a network round trip per item — see virtualAccounts.routes.ts for
 * the original version of this exact pattern, now shared across deposits and payouts too.
 */
export async function loadEndorsementEligibilityResolver(prisma: PrismaClient, customer: Customer): Promise<(endorsement: string | null) => EndorsementEligibility> {
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);
  const { endorsements } = await yativoClient.fiat.customers.get(yativoCustomerId);

  return (endorsement: string | null): EndorsementEligibility => {
    if (!endorsement) return { eligible: true, endorsementStatus: null, hostedKycUrl: null };
    const match = endorsements.find((e) => e.service === endorsement);
    return { eligible: match?.status === "approved", endorsementStatus: match?.status ?? null, hostedKycUrl: match?.hostedKycUrl ?? null };
  };
}

/** Authoritative gate right before money actually moves — throws 409 ENDORSEMENT_REQUIRED unless `endorsement` is null or already approved for this customer. `resource` names what's being gated (e.g. "This deposit gateway", "This payout gateway") for the error message. */
export async function requireEndorsementApproved(prisma: PrismaClient, customer: Customer, endorsement: string | null, resource: string): Promise<void> {
  if (!endorsement) return;
  const resolve = await loadEndorsementEligibilityResolver(prisma, customer);
  if (!resolve(endorsement).eligible) {
    throw new AppError(`${resource} requires ${endorsement.replace(/_/g, " ")} verification before it can be used.`, 409, "ENDORSEMENT_REQUIRED");
  }
}
