import type { Prisma, PrismaClient } from "@prisma/client";

/** Sentinel actorId for an automated action (webhook-triggered settlement/reversal, a scheduled poll worker, etc.) — never left ambiguous as to whether a human did this. */
export const SYSTEM_ACTOR_ID = "system";

/**
 * The one function every admin-visible mutation should call — records WHO (a staff user id, or
 * SYSTEM_ACTOR_ID for something automated) did WHAT to WHICH record, so it can be answered later
 * without digging through logs. Never throws: an audit-trail failure must never fail the action it
 * describes, same rationale as sendNotificationEmail's own swallow-and-log posture. Call this
 * AFTER the action's own DB write succeeds, not inside the same transaction — an audit log entry
 * for something that got rolled back would be actively misleading.
 */
export async function logAdminAction(prisma: PrismaClient, actorId: string, action: string, target: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    await prisma.adminAuditLog.create({ data: { actorId, action, target, metadata: (metadata as Prisma.InputJsonValue) ?? undefined } });
  } catch {
    // Deliberately swallowed — see doc comment above.
  }
}
