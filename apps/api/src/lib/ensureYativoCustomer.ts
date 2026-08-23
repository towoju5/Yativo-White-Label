import type { Customer, PrismaClient } from "@prisma/client";
import { YativoApiError, parseYativoErrorMessage } from "@white-label/yativo-sdk";
import { AppError } from "./errors.js";
import { yativoClient } from "./yativoClient.js";
import logger from "./logger.js";

/**
 * Lazily provisions a Yativo customer the first time a platform customer
 * needs one — creating a beneficiary, sending a payout, provisioning a
 * virtual account, issuing a card, or generating a deposit link all require
 * a Yativo customer_id. Persists the id once so this only runs once per
 * customer.
 *
 * Yativo requires a phone (E.164) and country (ISO3) to create a customer,
 * which the platform doesn't collect until KYC. `overrides` lets the KYC
 * submission flow supply them on first use; everything else relies on
 * `phone`/`countryCode` already being on the Customer row from a prior KYC
 * submission.
 */
export async function ensureYativoCustomer(
  prisma: PrismaClient,
  customer: Customer,
  overrides?: { phone?: string; countryIso3?: string },
): Promise<string> {
  if (customer.yativoCustomerId) return customer.yativoCustomerId;

  const phone = overrides?.phone ?? customer.phone;
  const countryIso3 = overrides?.countryIso3 ?? customer.countryCode;
  if (!phone || !countryIso3) {
    throw new AppError("Complete identity verification (phone + country) before using this feature.", 409, "YATIVO_CUSTOMER_NOT_PROVISIONED");
  }

  let yativoCustomerId: string;
  try {
    const result = await yativoClient.fiat.customers.create({
      fullName: customer.fullName ?? customer.businessName ?? customer.email,
      email: customer.email,
      phone,
      countryIso3,
      type: customer.type === "BUSINESS" ? "business" : "individual",
      // Our own customer id is already stable and unique — perfect idempotency key, and this
      // function only ever runs once per customer (guarded by the yativoCustomerId check above).
      idempotencyKey: customer.id,
    });
    yativoCustomerId = result.yativoCustomerId;
  } catch (err) {
    // Confirmed live: a customer for this email can already exist on Yativo's side (provisioned
    // before this row's yativoCustomerId was captured, or created directly against Yativo) —
    // create() 422s with "Customer email already exists" rather than being idempotent. Recover
    // the existing record by email instead of treating that as a hard failure.
    const message = err instanceof YativoApiError ? parseYativoErrorMessage(err.upstreamBody) : undefined;
    if (!message?.toLowerCase().includes("email already exists")) throw err;

    const existing = await yativoClient.fiat.customers.findByEmail(customer.email);
    if (!existing) throw err;
    yativoCustomerId = existing.yativoCustomerId;
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: { yativoCustomerId, phone, countryCode: countryIso3 },
  });
  return yativoCustomerId;
}

/**
 * Every non-admin customer is expected to be registered on Yativo — the two KYC submission
 * routes already register a customer at the moment phone/country first become available, so this
 * exists as a safety net for every other path a customer can end up "usable" without having gone
 * through them: an admin approving KYC manually, seed/imported data, a customer whose phone or
 * country got backfilled some other way, etc. Silently does nothing if there's not yet enough
 * information to register (no phone/country — nothing changed from before), and never throws —
 * a Yativo outage here must not block login or KYC approval, so failures are logged and swallowed.
 */
export async function tryEnsureYativoCustomer(prisma: PrismaClient, customer: Customer): Promise<void> {
  if (customer.yativoCustomerId || !customer.phone || !customer.countryCode) return;
  try {
    await ensureYativoCustomer(prisma, customer);
  } catch (err) {
    logger.warn({ err, customerId: customer.id }, "Could not auto-register customer with Yativo");
  }
}
