import { z } from "zod";

/**
 * Every customer-portal menu item an admin can switch on or off (Settings → Customer menu). Dashboard,
 * Profile and Settings are deliberately not listed — they're where a customer verifies identity and
 * manages security, so they can never be hidden. `path` is the portal route the item links to: the
 * portal hides nav entries and blocks the route itself by matching on it.
 *
 * Everything defaults to on except `swap`, which a platform has to opt into explicitly — it moves a
 * customer's balance between currencies at a rate the platform stands behind.
 */
export const PORTAL_MENUS = [
  { key: "wallets", path: "/portal/wallets", label: "Wallets", defaultEnabled: true },
  { key: "send", path: "/portal/send", label: "Withdraw / Send money", defaultEnabled: true },
  { key: "transfer", path: "/portal/transfer", label: "Transfer", defaultEnabled: true },
  { key: "swap", path: "/portal/swap", label: "Swap balance", defaultEnabled: false },
  { key: "deposit", path: "/portal/deposit", label: "Deposit", defaultEnabled: true },
  { key: "crypto", path: "/portal/crypto", label: "Crypto wallets", defaultEnabled: true },
  { key: "virtualAccounts", path: "/portal/virtual-accounts", label: "Virtual accounts", defaultEnabled: true },
  { key: "transactions", path: "/portal/transactions", label: "Transactions", defaultEnabled: true },
  { key: "statements", path: "/portal/statements", label: "Statements", defaultEnabled: true },
  { key: "beneficiaries", path: "/portal/beneficiaries", label: "Beneficiaries", defaultEnabled: true },
  { key: "cards", path: "/portal/cards", label: "Virtual cards", defaultEnabled: true },
  { key: "support", path: "/portal/support", label: "Support", defaultEnabled: true },
  { key: "team", path: "/portal/team", label: "Team (business accounts)", defaultEnabled: true },
] as const;

export type PortalMenuKey = (typeof PORTAL_MENUS)[number]["key"];
export const PORTAL_MENU_KEYS = PORTAL_MENUS.map((m) => m.key) as [PortalMenuKey, ...PortalMenuKey[]];
export const portalMenuKeySchema = z.enum(PORTAL_MENU_KEYS);

/** The menu whose route covers `pathname` (its own path or any sub-route), or undefined for a route no toggle controls. */
export function findPortalMenuForPath(pathname: string): (typeof PORTAL_MENUS)[number] | undefined {
  return PORTAL_MENUS.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
}

export const portalMenuSchema = z.object({
  key: portalMenuKeySchema,
  path: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  defaultEnabled: z.boolean(),
});
export type PortalMenu = z.infer<typeof portalMenuSchema>;

export const portalMenusResponseSchema = z.object({ menus: z.array(portalMenuSchema) });
export type PortalMenusResponse = z.infer<typeof portalMenusResponseSchema>;

export const updatePortalMenuSchema = z.object({ enabled: z.boolean() });
export type UpdatePortalMenuInput = z.infer<typeof updatePortalMenuSchema>;
