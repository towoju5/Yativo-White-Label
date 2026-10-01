import { randomUUID } from "node:crypto";
import type { Customer, Prisma, PrismaClient } from "@prisma/client";
import type { CreateTransferInput, TransferLookupInput } from "@white-label/shared-types";
import { AppError, NotFoundError, InsufficientFundsError } from "../../lib/errors.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { getAvailableBalance } from "../ledger/balances.js";
import { ensureCustomerWalletAccount, ensurePlatformAccount } from "../ledger/accounts.js";
import type { EntryLine } from "../ledger/types.js";
import { getEffectiveFee } from "../pricing/pricing.service.js";
import { checkPayoutLimit } from "../security/limits.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";

/** Phone lookup matches on the last 8 digits only — country codes / leading zeros / formatting vary too much between how people type a number and how it was stored. */
const PHONE_MATCH_DIGITS = 8;

type Party = Pick<Customer, "publicId" | "fullName" | "businessName" | "type">;

/** "Ada Lovelace" → "Ada L." — enough for the sender to recognise the recipient without exposing their full legal name. Businesses show their full trading name. */
function displayNameOf(c: Party): string {
  if (c.type === "BUSINESS" && c.businessName) return c.businessName;
  const parts = (c.fullName ?? c.businessName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

function toRecipientDto(c: Party) {
  return { publicId: c.publicId, displayName: displayNameOf(c), type: c.type };
}

/** Normalises a typed/scanned id: accepts a bare id ("ab12 cd34 ef"), a scanned receive-QR payment link (".../pay/AB12CD34EF"), or the older ".../portal/transfer?to=AB12CD34EF" form. */
export function normalizePublicId(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const fromPath = url.pathname.match(/\/pay\/([^/]+)\/?$/)?.[1];
    const to = fromPath ? decodeURIComponent(fromPath) : url.searchParams.get("to");
    if (to) return to.replace(/[\s-]/g, "").toUpperCase();
  } catch {
    // not a URL — a plain id
  }
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Deliberately no identity/KYC check: a customer's identity approval is the Yativo endorsement
 * (see endorsementEligibility.ts), which gates Yativo-backed services only. An internal transfer
 * never touches Yativo, and the platform has no approval of its own — so only a frozen account
 * (an explicit admin action) blocks it.
 */
function assertCanTransact(c: Customer, who: "sender" | "recipient") {
  if (c.status !== "ACTIVE" || c.deletedAt) {
    throw who === "sender"
      ? new AppError("Your account is frozen, so transfers are disabled. Contact support.", 403, "ACCOUNT_FROZEN")
      : new AppError("This account can't receive transfers right now.", 409, "RECIPIENT_UNAVAILABLE");
  }
}

async function findRecipient(prisma: PrismaClient, input: TransferLookupInput): Promise<Customer> {
  switch (input.method) {
    case "EMAIL": {
      const c = await prisma.customer.findFirst({ where: { email: { equals: input.value.trim(), mode: "insensitive" } } });
      if (!c) throw new NotFoundError("Recipient");
      return c;
    }
    case "PHONE": {
      const digits = input.value.replace(/\D/g, "");
      if (digits.length < PHONE_MATCH_DIGITS) {
        throw new AppError(`Enter at least the last ${PHONE_MATCH_DIGITS} digits of the phone number.`, 400, "PHONE_TOO_SHORT");
      }
      const suffix = digits.slice(-PHONE_MATCH_DIGITS);
      // `8` is inlined (not a bound parameter) — a JS number binds as bigint and right() only takes int. Keep in sync with PHONE_MATCH_DIGITS.
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM customers
        WHERE phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 8) = ${suffix}
        LIMIT 2`;
      if (rows.length === 0) throw new NotFoundError("Recipient");
      if (rows.length > 1) {
        throw new AppError("More than one account matches that phone number — use their email or customer ID instead.", 409, "RECIPIENT_AMBIGUOUS");
      }
      return prisma.customer.findUniqueOrThrow({ where: { id: rows[0]!.id } });
    }
    case "ID":
    case "QR": {
      const c = await prisma.customer.findUnique({ where: { publicId: normalizePublicId(input.value) } });
      if (!c) throw new NotFoundError("Recipient");
      return c;
    }
  }
}

export async function getTransferProfile(prisma: PrismaClient, customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const digits = c.phone?.replace(/\D/g, "") ?? "";
  return { publicId: c.publicId, displayName: displayNameOf(c), phoneHint: digits.length >= 4 ? `•••• ${digits.slice(-4)}` : null };
}

export async function lookupRecipient(prisma: PrismaClient, senderId: string, input: TransferLookupInput) {
  const recipient = await findRecipient(prisma, input);
  if (recipient.id === senderId) throw new AppError("You can't send a transfer to yourself.", 400, "TRANSFER_TO_SELF");
  assertCanTransact(recipient, "recipient");
  return toRecipientDto(recipient);
}

export async function quoteTransfer(prisma: PrismaClient, senderId: string, currencyCode: string, amountMinor: bigint) {
  const feeMinor = await getEffectiveFee(prisma, "INTERNAL_TRANSFER", senderId, amountMinor);
  return { currencyCode, amountMinor: amountMinor.toString(), feeMinor: feeMinor.toString(), totalMinor: (amountMinor + feeMinor).toString() };
}

/**
 * Wallet-to-wallet between two customers of this platform — no Yativo call, so it settles in one
 * POSTED ledger transaction: sender's wallet is debited amount+fee, recipient's wallet credited
 * amount, platform revenue credited the fee. `enforceNonNegativeOn` makes the balance check
 * authoritative under concurrency (see ledger/types.ts); the idempotency key comes from the client
 * so a double-submit returns the original transfer instead of sending twice.
 */
export async function createTransfer(prisma: PrismaClient, senderId: string, input: CreateTransferInput) {
  const idempotencyKey = `transfer:${senderId}:${input.idempotencyKey}`;
  const existing = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) {
    const prior = await prisma.internalTransfer.findUnique({ where: { transactionId: existing.id }, include: TRANSFER_INCLUDE });
    if (prior) return transferToDto(prior, senderId);
  }

  const amountMinor = BigInt(input.amountMinor);
  if (amountMinor <= 0n) throw new AppError("Enter an amount greater than zero.", 400, "INVALID_AMOUNT");

  const [sender, recipient] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: senderId } }),
    prisma.customer.findUnique({ where: { publicId: normalizePublicId(input.recipientPublicId) } }),
  ]);
  if (!recipient) throw new NotFoundError("Recipient");
  if (recipient.id === senderId) throw new AppError("You can't send a transfer to yourself.", 400, "TRANSFER_TO_SELF");
  assertCanTransact(sender, "sender");
  assertCanTransact(recipient, "recipient");

  const senderWallet = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: senderId, currencyCode: input.currencyCode } });
  if (!senderWallet) throw new NotFoundError("Wallet");

  const feeMinor = await getEffectiveFee(prisma, "INTERNAL_TRANSFER", senderId, amountMinor);
  const totalMinor = amountMinor + feeMinor;

  await checkPayoutLimit(prisma, senderId, input.currencyCode, amountMinor);

  // Fast, non-authoritative fail-fast; enforceNonNegativeOn below is the real guarantee.
  const available = await getAvailableBalance(prisma, senderWallet.id, "CUSTOMER_WALLET");
  if (available < totalMinor) throw new InsufficientFundsError(senderWallet.id);

  // The recipient may never have held this currency — provisioned on demand, same as card funding does for USD.
  const recipientWallet = await ensureCustomerWalletAccount(prisma, recipient.id, input.currencyCode);

  const lines: EntryLine[] = [
    { accountId: senderWallet.id, direction: "DEBIT", amountMinor: totalMinor, currencyCode: input.currencyCode },
    { accountId: recipientWallet.id, direction: "CREDIT", amountMinor, currencyCode: input.currencyCode },
  ];
  if (feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", input.currencyCode);
    lines.push({ accountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeMinor, currencyCode: input.currencyCode });
  }

  const transferId = randomUUID();
  const senderName = displayNameOf(sender);
  const recipientName = displayNameOf(recipient);
  const tx = await postTransaction(prisma, {
    type: "TRANSFER",
    status: "POSTED",
    idempotencyKey,
    externalSource: "MANUAL",
    description: `Transfer from ${senderName} to ${recipientName}${input.note ? ` — ${input.note}` : ""}`,
    metadata: {
      transferId,
      senderPublicId: sender.publicId,
      recipientPublicId: recipient.publicId,
      amountMinor: amountMinor.toString(),
      feeMinor: feeMinor.toString(),
      ...(input.note ? { note: input.note } : {}),
    },
    lines,
    enforceNonNegativeOn: [senderWallet.id],
  });

  const transfer = await prisma.internalTransfer.create({
    data: {
      id: transferId,
      senderCustomerId: senderId,
      recipientCustomerId: recipient.id,
      currencyCode: input.currencyCode,
      amountMinor,
      feeMinor,
      note: input.note || null,
      lookupMethod: input.lookupMethod,
      transactionId: tx.id,
    },
    include: TRANSFER_INCLUDE,
  });

  const amount = await formatMinorAmount(prisma, input.currencyCode, amountMinor);
  await Promise.all([
    sendNotificationEmail(prisma, "TRANSFER_SENT", senderId, { amount, currency: input.currencyCode, counterpartyName: recipientName }),
    sendNotificationEmail(prisma, "TRANSFER_RECEIVED", recipient.id, { amount, currency: input.currencyCode, counterpartyName: senderName }),
  ]);

  return transferToDto(transfer, senderId);
}

const PARTY_SELECT = { publicId: true, fullName: true, businessName: true, type: true } as const;
const TRANSFER_INCLUDE = { sender: { select: PARTY_SELECT }, recipient: { select: PARTY_SELECT } } as const;

type TransferWithParties = Prisma.InternalTransferGetPayload<{ include: typeof TRANSFER_INCLUDE }>;

function transferToDto(t: TransferWithParties, viewerCustomerId: string) {
  const sent = t.senderCustomerId === viewerCustomerId;
  return {
    id: t.id,
    direction: sent ? ("SENT" as const) : ("RECEIVED" as const),
    counterparty: toRecipientDto(sent ? t.recipient : t.sender),
    currencyCode: t.currencyCode,
    amountMinor: t.amountMinor.toString(),
    // The fee is the sender's cost only — never shown to the recipient.
    feeMinor: sent ? t.feeMinor.toString() : "0",
    note: t.note,
    transactionId: t.transactionId,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function listTransfers(prisma: PrismaClient, customerId: string, limit: number) {
  const rows = await prisma.internalTransfer.findMany({
    where: { OR: [{ senderCustomerId: customerId }, { recipientCustomerId: customerId }] },
    include: TRANSFER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((t) => transferToDto(t, customerId));
}

/** Distinct people this customer has sent to, most recent first — for one-tap repeat transfers. */
export async function listRecentRecipients(prisma: PrismaClient, customerId: string, limit = 8) {
  const rows = await prisma.internalTransfer.findMany({
    where: { senderCustomerId: customerId },
    include: { recipient: { select: { ...PARTY_SELECT, status: true, deletedAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const seen = new Set<string>();
  const out: ReturnType<typeof toRecipientDto>[] = [];
  for (const r of rows) {
    if (seen.has(r.recipientCustomerId) || r.recipient.status !== "ACTIVE" || r.recipient.deletedAt) continue;
    seen.add(r.recipientCustomerId);
    out.push(toRecipientDto(r.recipient));
    if (out.length >= limit) break;
  }
  return out;
}

// ── Admin ────────────────────────────────────────────────────────────────────

const ADMIN_PARTY_SELECT = { id: true, publicId: true, fullName: true, businessName: true, email: true, type: true } as const;
const ADMIN_TRANSFER_INCLUDE = { sender: { select: ADMIN_PARTY_SELECT }, recipient: { select: ADMIN_PARTY_SELECT } } as const;
type AdminTransferRow = Prisma.InternalTransferGetPayload<{ include: typeof ADMIN_TRANSFER_INCLUDE }>;

function adminPartyToDto(c: AdminTransferRow["sender"]) {
  return { customerId: c.id, publicId: c.publicId, name: c.fullName ?? c.businessName ?? null, email: c.email, type: c.type };
}

async function adminTransfersToDto(prisma: PrismaClient, rows: AdminTransferRow[]) {
  const txs = await prisma.ledgerTransaction.findMany({ where: { id: { in: rows.map((r) => r.transactionId) } }, select: { id: true, status: true } });
  const statusById = new Map(txs.map((t) => [t.id, t.status]));
  return rows.map((t) => ({
    id: t.id,
    sender: adminPartyToDto(t.sender),
    recipient: adminPartyToDto(t.recipient),
    currencyCode: t.currencyCode,
    amountMinor: t.amountMinor.toString(),
    feeMinor: t.feeMinor.toString(),
    totalDebitMinor: (t.amountMinor + t.feeMinor).toString(),
    note: t.note,
    lookupMethod: t.lookupMethod,
    transactionId: t.transactionId,
    ledgerStatus: statusById.get(t.transactionId) ?? "POSTED",
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function listAdminTransfers(
  prisma: PrismaClient,
  filters: { search?: string; customerId?: string; currencyCode?: string; dateFrom?: Date; dateTo?: Date },
  page: number,
  pageSize: number,
) {
  const q = filters.search?.trim();
  const partyMatch = (value: string): Prisma.CustomerWhereInput => ({
    OR: [
      { fullName: { contains: value, mode: "insensitive" } },
      { businessName: { contains: value, mode: "insensitive" } },
      { email: { contains: value, mode: "insensitive" } },
      { publicId: { equals: value.replace(/[\s-]/g, "").toUpperCase() } },
    ],
  });
  const where: Prisma.InternalTransferWhereInput = {
    AND: [
      filters.customerId ? { OR: [{ senderCustomerId: filters.customerId }, { recipientCustomerId: filters.customerId }] } : {},
      filters.currencyCode ? { currencyCode: filters.currencyCode } : {},
      filters.dateFrom || filters.dateTo
        ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {},
      q ? { OR: [{ sender: partyMatch(q) }, { recipient: partyMatch(q) }, { id: q }, { transactionId: q }] } : {},
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.internalTransfer.count({ where }),
    prisma.internalTransfer.findMany({ where, include: ADMIN_TRANSFER_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: await adminTransfersToDto(prisma, rows), total, page, pageSize };
}

export async function getAdminTransfer(prisma: PrismaClient, id: string) {
  const row = await prisma.internalTransfer.findUnique({ where: { id }, include: ADMIN_TRANSFER_INCLUDE });
  if (!row) throw new NotFoundError("Transfer");
  return (await adminTransfersToDto(prisma, [row]))[0]!;
}
