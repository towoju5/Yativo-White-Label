import { cn } from "@/lib/utils";

/** Small self-contained mockup of Prime's sidebar + persistent header dashboard, used in the branding template gallery. */
export function PrimePreviewThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden rounded-md bg-white ring-1 ring-black/10", className)}>
      <div className="flex w-1/4 flex-col gap-1.5 border-r border-black/10 bg-white p-1.5">
        <div className="mb-1 h-1.5 w-1.5 rounded-sm bg-[hsl(var(--brand-primary))]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn("h-1.5 rounded-sm", i === 0 ? "bg-[hsl(var(--brand-primary))]/15" : "bg-black/10")} />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end gap-1 border-b border-black/10 px-2 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-black/15" />
          <div className="h-1.5 w-1.5 rounded-full bg-black/15" />
          <div className="h-2 w-2 rounded-full bg-[hsl(var(--brand-primary))]/60" />
        </div>
        <div className="flex-1 space-y-1.5 p-2">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 rounded-sm border border-black/10" />
            ))}
          </div>
          <div className="h-8 rounded-sm border border-black/10" />
        </div>
      </div>
    </div>
  );
}
