import { z } from "zod";

/**
 * The fixed catalog of granular permissions a BUSINESS customer can grant to an invited team
 * member. Every key here maps to a real portal module (confirmed against the live portal route
 * table before adding this system). OWNER/ADMIN team members always have full access regardless
 * of this list (see requirePortalPermission() in the API) — this only exists to let a business
 * owner narrow what a MEMBER-tier login can do. Unlike staff's DEFAULT_STAFF_PERMISSIONS, a newly
 * invited member starts with none of these — least-privilege by default, since granting access to
 * someone else's money should be an explicit, deliberate choice each time.
 */
export const PORTAL_PERMISSIONS = [
  "wallets.view",
  "wallets.transfer",
  "beneficiaries.manage",
  "cards.manage",
  "statements.view",
  "deposits.manage",
  "virtual_accounts.manage",
  "crypto.manage",
  "team.manage",
] as const;

export const portalPermissionSchema = z.enum(PORTAL_PERMISSIONS);
export type PortalPermission = z.infer<typeof portalPermissionSchema>;

export const PORTAL_PERMISSION_CATALOG: { key: PortalPermission; label: string; group: string; description: string }[] = [
  { key: "wallets.view", label: "View wallets & transactions", group: "Money", description: "See wallet balances and transaction history." },
  { key: "wallets.transfer", label: "Send money", group: "Money", description: "Send payouts and transfers out of the business's wallets." },
  { key: "deposits.manage", label: "Manage deposits", group: "Money", description: "Create deposit requests and view deposit instructions." },
  { key: "beneficiaries.manage", label: "Manage beneficiaries", group: "Money", description: "Add, edit, or remove saved payout beneficiaries." },
  { key: "virtual_accounts.manage", label: "Manage virtual accounts", group: "Money", description: "Create and manage virtual account numbers." },
  { key: "crypto.manage", label: "Manage crypto wallets", group: "Money", description: "Create and manage crypto deposit wallets." },
  { key: "cards.manage", label: "Manage cards", group: "Cards", description: "Issue, freeze, unfreeze, or view virtual cards." },
  { key: "statements.view", label: "View & export statements", group: "Reporting", description: "Generate, download, and email statements of account." },
  { key: "team.manage", label: "Manage team", group: "Team", description: "Invite, edit, deactivate, or remove other team members." },
];

/** A newly invited member gets none of these until the business owner grants them — see this
 * file's module doc comment for why that differs from the staff-side default. */
export const DEFAULT_PORTAL_MEMBER_PERMISSIONS: PortalPermission[] = [];
