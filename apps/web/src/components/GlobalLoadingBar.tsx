import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * A thin indeterminate progress bar pinned to the top of the viewport whenever any query or
 * mutation is in flight — the single place that answers "is something loading right now" for
 * every action across the whole app (customer portal and admin console alike), instead of each
 * page having to remember to wire up its own spinner. Individual buttons still show their own
 * "Saving…"/spinner state for the specific action clicked; this is the app-wide backstop for
 * anything that doesn't (or a background refetch the user didn't directly trigger).
 */
export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  if (!active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/10" aria-hidden>
      <div className="h-full w-1/3 animate-loading-bar bg-primary" />
    </div>
  );
}
