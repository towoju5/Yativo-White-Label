import { cn } from "@/lib/utils";

/** Small self-contained mockup of Nova's sidebar + dense dashboard, used in the branding template gallery. */
export function NovaPreviewThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden rounded-md bg-[#0b1120] ring-1 ring-white/10", className)}>
      <div className="flex w-1/4 flex-col gap-1.5 border-r border-white/10 bg-white/[0.03] p-2">
        <div className="mb-1 h-2 w-2 rounded-sm bg-[hsl(var(--brand-primary))]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn("h-1.5 rounded-full", i === 0 ? "bg-[hsl(var(--brand-primary))]/70" : "bg-white/15")} />
        ))}
      </div>
      <div className="flex-1 p-2.5">
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 rounded-sm bg-white/10" />
          ))}
        </div>
        <div className="h-10 rounded-sm bg-gradient-to-br from-[hsl(var(--brand-primary))]/30 to-transparent ring-1 ring-white/10" />
        <div className="mt-1.5 space-y-1">
          <div className="h-1.5 w-full rounded-full bg-white/10" />
          <div className="h-1.5 w-3/4 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
