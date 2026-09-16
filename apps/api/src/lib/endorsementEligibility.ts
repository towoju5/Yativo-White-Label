import type { Customer, PrismaClient } from "@prisma/client";
import { yativoClient } from "./yativoClient.js";
import { ensureYativoCustomer } from "./ensureYativoCustomer.js";
import { AppError } from "./errors.js";

export type EndorsementEligibility = {
  eligible: boolean;
  endorsementStatus: string | null;
  hostedKycUrl: string | null;
};

/** Endorsement services Yativo only extends to business customers — not an approval status, so no amount of KYC ever unlocks these for an individual. */
const BUSINESS_ONLY_ENDORSEMENTS = new Set(["cobo_pobo"]);

/** True when `endorsement` is business-only and `customer` isn't a business — callers use this to drop the gateway/currency/method from lists entirely rather than showing it as a locked, "get verified" option. */
export function isEndorsementRestrictedForCustomer(endorsement: string | null, customer: Pick<Customer, "type">): boolean {
  return !!endorsement && BUSINESS_ONLY_ENDORSEMENTS.has(endorsement) && customer.type !== "BUSINESS";
}

/** Endorsement-gated rails this platform doesn't offer to anyone, regardless of customer type — Yativo exposes them, this product doesn't. */
const HIDDEN_ENDORSEMENTS = new Set(["sepa", "base"]);

/** True when `endorsement` names a rail this platform hides outright — callers drop the gateway/currency/method entirely, same treatment as isEndorsementRestrictedForCustomer. */
export function isHiddenEndorsement(endorsement: string | null): boolean {
  return !!endorsement && HIDDEN_ENDORSEMENTS.has(endorsement);
}

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
  if (isHiddenEndorsement(endorsement)) {
    throw new AppError(`${resource} isn't available.`, 404, "UNSUPPORTED_GATEWAY");
  }
  if (isEndorsementRestrictedForCustomer(endorsement, customer)) {
    throw new AppError(`${resource} is only available to business customers.`, 403, "BUSINESS_CUSTOMER_REQUIRED");
  }
  const resolve = await loadEndorsementEligibilityResolver(prisma, customer);
  if (!resolve(endorsement).eligible) {
    throw new AppError(`${resource} requires ${endorsement.replace(/_/g, " ")} verification before it can be used.`, 409, "ENDORSEMENT_REQUIRED");
  }
}
