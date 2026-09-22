import type { DemoSession, PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import logger from "../../lib/logger.js";
import { generateDemoToken, hashDemoToken } from "./demoToken.js";
import { generateDemoDatabaseName, provisionDemoDatabase, getDemoPrismaClient } from "./demoDatabase.service.js";
import { seedDemoDatabase } from "./demoSeed.js";
import { AppError } from "../../lib/errors.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { renderDemoReadyEmail } from "./demoEmail.js";

export class DemoSessionInvalidError extends AppError {
  constructor(message = "This demo link is invalid or has expired") {
    super(message, 410, "DEMO_SESSION_INVALID");
  }
}

/**
 * Creates a new demo session: provisions an isolated database, runs migrations, seeds synthetic
 * data, and returns the one-time full URL. Provisioning runs inline (awaited) rather than
 * backgrounded — CREATE DATABASE + migrate deploy + seed typically completes in a couple of
 * seconds for this schema, and a synchronous response means the admin never has to poll a status
 * endpoint to get the link. On any failure, the DemoSession row is marked FAILED (never left
 * dangling as ACTIVE) and the error is rethrown.
 */
export async function createDemoSession(
  prisma: PrismaClient,
  createdByStaffUserId: string | null,
  requester?: { businessName: string; email: string },
): Promise<{ session: DemoSession; url: string }> {
  const token = generateDemoToken();
  const tokenHash = hashDemoToken(token);
  const databaseName = generateDemoDatabaseName();
  const expiresAt = new Date(Date.now() + env.DEMO_DURATION_HOURS * 60 * 60 * 1000);

  const session = await prisma.demoSession.create({
    data: {
      tokenHash,
      databaseName,
      expiresAt,
      createdByStaffUserId,
      requestedBusinessName: requester?.businessName,
      requestedByEmail: requester?.email,
      status: "ACTIVE",
    },
  });

  const url = `${env.DEMO_BASE_URL}/demo/${token}`;

  try {
    await provisionDemoDatabase(databaseName);
    const demoPrisma = getDemoPrismaClient(databaseName);
    const { demoUserId, adminEmail, adminPassword } = await seedDemoDatabase(demoPrisma, requester);
    await prisma.demoSession.update({ where: { id: session.id }, data: { demoUserId } });
    logger.info({ demoId: session.id, status: "ACTIVE" }, "demo.created");

    if (requester?.email) {
      await sendDemoCredentialsEmail(prisma, { to: requester.email, businessName: requester.businessName, demoUrl: url, adminEmail, adminPassword, expiresAt });
    }
  } catch (err) {
    await prisma.demoSession.update({
      where: { id: session.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : "Unknown provisioning error" },
    });
    logger.error({ demoId: session.id, err }, "demo.created.failed");
    throw err;
  }

  // Never re-log or re-expose the raw token beyond this single response. When a requester email
  // was provided, the caller (POST /demo/request) also doesn't return this in its HTTP response —
  // email is the only channel the credentials travel over for the self-service flow.
  return { session, url };
}

/**
 * Delivers the one-time demo link plus the seeded admin-panel credentials by email — the only
 * place these ever leave the server for a self-service (public landing page) demo request.
 * Fire-and-forget from the caller's perspective in the sense that a delivery failure here still
 * throws (caught by createDemoSession's try/catch, which marks the session FAILED) rather than
 * silently leaving a session ACTIVE with nobody able to reach it.
 */
async function sendDemoCredentialsEmail(
  prisma: PrismaClient,
  params: {
    to: string;
    businessName: string;
    demoUrl: string;
    adminEmail: string;
    adminPassword: string;
    expiresAt: Date;
  },
): Promise<void> {
  // Branding comes from the production database (`prisma` here is the main client, never the
  // demo one) so the email matches the real platform's name, logo, and color.
  const branding = await prisma.brandingConfig.findUnique({ where: { id: 1 } });
  const { subject, html, text } = renderDemoReadyEmail({
    productName: branding?.productName ?? "Demo",
    logoUrl: branding?.logoUrl ?? null,
    primaryColor: branding?.primaryColor ?? "#4f46e5",
    supportEmail: branding?.supportEmail ?? null,
    businessName: params.businessName,
    demoUrl: params.demoUrl,
    adminUrl: `${env.DEMO_BASE_URL}/admin/login`,
    adminEmail: params.adminEmail,
    adminPassword: params.adminPassword,
    expiresAt: params.expiresAt,
    durationHours: env.DEMO_DURATION_HOURS,
  });
  await enqueueEmail({ to: params.to, subject, html, text });
}

/**
 * Resolves a raw demo token to its ACTIVE, unexpired DemoSession. Fails closed: any invalid,
 * expired, destroyed, destroying, or failed session throws DemoSessionInvalidError rather than
 * ever falling back to a default/production identity.
 */
export async function resolveDemoSessionByToken(prisma: PrismaClient, token: string): Promise<DemoSession> {
  const tokenHash = hashDemoToken(token);
  const session = await prisma.demoSession.findUnique({ where: { tokenHash } });
  if (!session) {
    logger.warn({ event: "demo.authentication", result: "not_found" }, "demo.authentication");
    throw new DemoSessionInvalidError();
  }
  if (session.status !== "ACTIVE" || session.expiresAt.getTime() <= Date.now()) {
    logger.warn({ demoId: session.id, status: session.status, event: "demo.authentication", result: "rejected" }, "demo.authentication");
    throw new DemoSessionInvalidError();
  }
  await prisma.demoSession.update({ where: { id: session.id }, data: { lastAccessedAt: new Date() } });
  logger.info({ demoId: session.id, event: "demo.accessed" }, "demo.accessed");
  return session;
}

export async function getDemoSessionById(prisma: PrismaClient, id: string): Promise<DemoSession | null> {
  return prisma.demoSession.findUnique({ where: { id } });
}

export async function listDemoSessions(prisma: PrismaClient): Promise<DemoSession[]> {
  return prisma.demoSession.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}
