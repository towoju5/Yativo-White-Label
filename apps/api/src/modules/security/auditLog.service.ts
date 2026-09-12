import type { PrismaClient } from "@prisma/client";

/** Fire-and-forget security-activity log entry, surfaced read-only in portal Settings. Never blocks or fails the action it's attached to. */
export async function logCustomerAction(prisma: PrismaClient, customerId: string, action: string, meta: { ip?: string; userAgent?: string } = {}): Promise<void> {
  try {
    await prisma.customerAuditLog.create({ data: { customerId, action, ip: meta.ip, userAgent: meta.userAgent } });
  } catch {
    // Never let audit logging break the action it's describing.
  }
}
