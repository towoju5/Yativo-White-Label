/**
 * Where to send a customer once they finish signing in or signing up — e.g. a payment link
 * (/pay/:id → /portal/transfer?to=ID) or any protected portal page they were bounced from.
 *
 * Kept in localStorage (not router state) so it survives the flows that leave the page: email
 * verification and magic links open in a new tab. Expires after an hour so a stale intent never
 * hijacks some later, unrelated login. Only same-origin /portal paths are accepted — this value
 * ends up in navigate(), so it must never become an open redirect.
 */
const KEY = "postAuthRedirect";
const TTL_MS = 60 * 60 * 1000;

function isSafePortalPath(path: string): boolean {
  return path.startsWith("/portal") && !path.startsWith("//") && !path.startsWith("/portal/login") && !path.startsWith("/portal/signup");
}

export function setPostAuthRedirect(path: string): void {
  if (!isSafePortalPath(path)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // storage unavailable (private mode etc.) — the customer just lands on the dashboard
  }
}

/** Returns the saved destination (and clears it), or `fallback` when there's none / it expired. */
export function takePostAuthRedirect(fallback = "/portal"): string {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return fallback;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (typeof path !== "string" || typeof at !== "number" || Date.now() - at > TTL_MS || !isSafePortalPath(path)) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
