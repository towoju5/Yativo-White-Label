import { cn } from "@/lib/utils";

/** Small self-contained mockup of Meridian's block sidebar + hero-and-cards dashboard, used in the branding template gallery. */
export function MeridianPreviewThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden rounded-md bg-[#f3f4f6] ring-1 ring-black/10", className)}>
      <div className="flex w-1/3 flex-col gap-1 p-1.5">
        <div className="rounded-sm bg-white p-1 shadow-sm">
          <div className="h-1.5 w-1.5 rounded-[1px] bg-[hsl(var(--brand-primary))]" />
        </div>
        <div className="flex-1 space-y-1 rounded-sm bg-white p-1 shadow-sm">
          <div className="h-1.5 rounded-[2px] bg-[hsl(var(--brand-primary))]/80" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-[2px] bg-black/10" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-1.5 p-1.5">
        <div className="rounded-sm border border-black/10 bg-white p-1.5 shadow-sm">
          <div className="h-1 w-6 rounded-full bg-[hsl(var(--brand-primary))]/60" />
          <div className="mt-1 h-1.5 w-14 rounded-full bg-black/25" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 rounded-sm border border-black/10 bg-white shadow-sm" />
          ))}
        </div>
        <div className="h-5 rounded-sm border border-black/10 bg-white shadow-sm" />
      </div>
    </div>
  );
}
