import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

/**
 * App-wide "something is happening" feedback — two parts, so both a background refetch and a
 * button the user just clicked always show *something*, without requiring every one of the ~60
 * action buttons in the app to be individually wired up for it:
 *
 * 1. A thin progress bar across the very top of the viewport for ANY query or mutation in
 *    flight — quiet, continuous, easy to miss on purpose (a background refetch shouldn't shout).
 * 2. A floating "Loading…" pill, with a large spinner and a label, specifically for MUTATIONS —
 *    the thing that happens right after a click. This is the part that's impossible to miss: it
 *    pops into a fixed corner of the screen the instant an action starts, and disappears the
 *    instant it settles, so a click always has an unmistakable, obvious reaction.
 */
export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();

  return (
    <>
      {fetching + mutating > 0 && (
        <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/10" aria-hidden>
          <div className="h-full w-1/3 animate-loading-bar bg-primary" />
        </div>
      )}

      {mutating > 0 && (
        <div
          className="fixed bottom-20 right-4 z-[100] flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium shadow-elevated lg:bottom-6"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          Loading…
        </div>
      )}
    </>
  );
}
