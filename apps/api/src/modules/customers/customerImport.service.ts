import type { PrismaClient, CustomerImportRun } from "@prisma/client";
import type { FiatCustomerListItem } from "@white-label/yativo-sdk";
import { ConflictError } from "../../lib/errors.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { enqueueCustomerImport } from "../../jobs/customerImportQueue.js";
import logger from "../../lib/logger.js";

const PAGE_SIZE = 100;
// Belt-and-suspenders against a pagination bug on either side looping forever — no real Yativo
// account list is anywhere near 200k customers today.
const MAX_PAGES = 2000;

const INACTIVE_STATUSES = new Set(["inactive", "suspended", "frozen", "blocked", "disabled", "deleted"]);

export function customerImportRunToDto(run: CustomerImportRun) {
  return {
    id: run.id,
    status: run.status,
    totalFetched: run.totalFetched,
    imported: run.imported,
    skipped: run.skipped,
    failed: run.failed,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

/** Starts a background sync (see runCustomerImport) — only one may run at a time, mirroring the reconciliation module's own single-flight posture for a similar whole-platform scan. */
export async function triggerCustomerImport(prisma: PrismaClient, staffId: string): Promise<CustomerImportRun> {
  const inProgress = await prisma.customerImportRun.findFirst({ where: { status: "RUNNING" } });
  if (inProgress) throw new ConflictError("A customer import is already running");

  const run = await prisma.customerImportRun.create({ data: { triggeredById: staffId } });
  await enqueueCustomerImport(run.id);
  await logAdminAction(prisma, staffId, "customer.import.triggered", "yativo", { runId: run.id });
  return run;
}

export async function listCustomerImportRuns(prisma: PrismaClient, limit = 10): Promise<CustomerImportRun[]> {
  return prisma.customerImportRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

/**
 * Creates a local account for one Yativo customer not already known locally — never touches an
 * existing row (a customer who already signed up directly keeps their own account untouched, even
 * if Yativo also has a record for the same email). The new row has no passwordHash and
 * requiresPasswordSetup: true, so it can only be reached via a magic-link login until the customer
 * sets their own password (see portalAuth.service.ts's verifyMagicLink/setupCustomerPassword).
 */
async function importOneCustomer(prisma: PrismaClient, item: FiatCustomerListItem): Promise<"imported" | "skipped"> {
  const email = item.email?.trim().toLowerCase();
  if (!email) return "skipped"; // no address to send a magic link to — can't ever be signed into

  const existing = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
  if (existing) return "skipped";

  const isBusiness = item.type === "business";
  const status = item.status && INACTIVE_STATUSES.has(item.status.trim().toLowerCase()) ? "FROZEN" : "ACTIVE";
  const createdAt = item.createdAt ? new Date(item.createdAt) : undefined;

  try {
    await prisma.customer.create({
      data: {
        type: isBusiness ? "BUSINESS" : "INDIVIDUAL",
        fullName: isBusiness ? null : item.name,
        businessName: isBusiness ? item.name : null,
        email,
        passwordHash: null,
        phone: item.phone,
        countryCode: item.countryIso3,
        status,
        yativoCustomerId: item.yativoCustomerId,
        source: "IMPORTED",
        requiresPasswordSetup: true,
        // Already a vetted Yativo customer — treated as pre-verified rather than making them
        // click a "verify your email" link for an address Yativo itself already sends mail to.
        emailVerifiedAt: new Date(),
        createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined,
      },
    });
    return "imported";
  } catch (err) {
    // Unique constraint race (e.g. concurrent import runs, or the customer signed up locally in
    // the moment between the findUnique above and this create) — same outcome as finding it
    // up front, not a real failure.
    if (isUniqueConstraintError(err)) return "skipped";
    throw err;
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/** The background job body (see jobs/workers/customerImport.worker.ts) — pages through every Yativo customer and imports the ones not yet known locally, updating the run row's counters as it goes so the admin UI can poll progress. */
export async function runCustomerImport(prisma: PrismaClient, runId: string): Promise<void> {
  let totalFetched = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await yativoClient.fiat.customers.list({ page, perPage: PAGE_SIZE });
      totalFetched += result.items.length;

      for (const item of result.items) {
        try {
          const outcome = await importOneCustomer(prisma, item);
          if (outcome === "imported") imported++;
          else skipped++;
        } catch (err) {
          failed++;
          logger.error({ err, runId, yativoCustomerId: item.yativoCustomerId }, "customer import: failed to import one row");
        }
      }

      await prisma.customerImportRun.update({ where: { id: runId }, data: { totalFetched, imported, skipped, failed } });

      if (result.items.length === 0 || page >= result.lastPage) break;
    }

    await prisma.customerImportRun.update({ where: { id: runId }, data: { status: "COMPLETED", finishedAt: new Date() } });
  } catch (err) {
    logger.error({ err, runId }, "customer import run failed");
    await prisma.customerImportRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
  }
}
