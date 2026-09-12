/** Finds the nav item whose route best matches the current path, for showing "Dashboard" / "Settings" / etc. in a mobile header instead of a static product name. Prefers the longest matching `to` so a sub-route like `/portal/wallets/abc` still resolves to the "Wallets" nav item rather than falling through to the fallback. */
export function findCurrentPageLabel(items: { to: string; label: string; end?: boolean }[], pathname: string, fallback: string): string {
  let best: { to: string; label: string } | null = null;
  for (const item of items) {
    const matches = item.end ? item.to === pathname : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (matches && (!best || item.to.length > best.to.length)) {
      best = item;
    }
  }
  return best?.label ?? fallback;
}
