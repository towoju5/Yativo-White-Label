import { cn } from "@/lib/utils";

/** Small self-contained mockup of Atlas's top nav + hero-driven dashboard, used in the branding template gallery. */
export function AtlasPreviewThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-[#faf9fc] ring-1 ring-black/10", className)}>
      <div className="flex items-center justify-between border-b border-black/5 px-2.5 py-1.5">
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--brand-primary))]" />
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-1.5 w-4 rounded-full bg-black/10" />
          ))}
        </div>
        <div className="h-2.5 w-2.5 rounded-full bg-black/10" />
      </div>
      <div className="flex-1 p-2.5">
        <div className="h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--brand-primary))] to-[hsl(var(--brand-secondary))] opacity-90" />
        <div className="mt-1.5 flex gap-1.5">
          <div className="h-7 flex-1 rounded-md bg-black/5" />
          <div className="h-7 flex-1 rounded-md bg-black/5" />
          <div className="h-7 flex-1 rounded-md bg-black/5" />
        </div>
      </div>
    </div>
  );
}
