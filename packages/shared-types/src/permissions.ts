import { z } from "zod";

/**
 * The fixed catalog of granular staff permissions. OWNER and ADMIN always have full access
 * regardless of this list (see requirePermission() in the API) — this only exists to let an
 * admin narrow what a STAFF-tier account can do, via an optional custom Role.
 *
 * Every key here maps to a real, currently-open-to-any-staff endpoint (confirmed against the
 * live route table before adding this system) — nothing here is speculative. A staff member with
 * no custom role assigned gets DEFAULT_STAFF_PERMISSIONS (below), which preserves today's actual
 * behavior exactly — assigning a custom role is what lets an admin dial that down.
 */
export const STAFF_PERMISSIONS = [
  "customers.write",
  "kyc.review",
  "endorsements.manage",
  "cards.manage",
  "crypto.manage",
  "webhooks.manage",
  "reconciliation.manage",
  "api_keys.manage",
  "team.manage",
] as const;

export const staffPermissionSchema = z.enum(STAFF_PERMISSIONS);
export type StaffPermission = z.infer<typeof staffPermissionSchema>;

export const PERMISSION_CATALOG: { key: StaffPermission; label: string; group: string; description: string }[] = [
  { key: "customers.write", label: "Freeze / unfreeze customers", group: "Customers", description: "Freeze or unfreeze a customer's account." },
  { key: "kyc.review", label: "Review KYC", group: "Customers", description: "Approve or reject a customer's KYC submission." },
  { key: "endorsements.manage", label: "Manage endorsements", group: "Customers", description: "Regenerate a customer's hosted verification links." },
  { key: "cards.manage", label: "Manage cards", group: "Payments", description: "Issue, freeze, unfreeze, or terminate virtual cards." },
  { key: "crypto.manage", label: "Manage crypto wallets", group: "Payments", description: "Create or remove customer crypto deposit wallets." },
  { key: "webhooks.manage", label: "Manage webhooks", group: "Operations", description: "Retry failed webhook events." },
  { key: "reconciliation.manage", label: "Run reconciliation", group: "Operations", description: "Trigger a reconciliation run." },
  { key: "api_keys.manage", label: "Manage API keys", group: "Platform", description: "Create or revoke platform API keys." },
  { key: "team.manage", label: "Manage team & roles", group: "Platform", description: "Invite, edit, deactivate, or remove staff; create and edit custom roles." },
];

/** What an unassigned STAFF-tier account can do today — every permission except team.manage, which is new and was never something plain staff could do. */
export const DEFAULT_STAFF_PERMISSIONS: StaffPermission[] = STAFF_PERMISSIONS.filter((p) => p !== "team.manage");
