import { cn } from "@/lib/utils";

/** Small self-contained mockup of Aurora's block sidebar + bento dashboard, used in the branding template gallery. */
export function AuroraPreviewThumbnail({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden rounded-md bg-[#faf7fb] ring-1 ring-black/10", className)}>
      <div className="flex w-1/4 flex-col gap-1 p-1.5">
        <div className="rounded-md bg-white p-1 shadow-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-primary))] to-[hsl(var(--brand-secondary))]" />
        </div>
        <div className="flex-1 space-y-1 rounded-md bg-white p-1 shadow-sm">
          <div className="h-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--brand-primary))] to-[hsl(var(--brand-secondary))] opacity-80" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-full bg-black/10" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-1.5 p-1.5">
        <div className="grid grid-cols-3 gap-1">
          <div className="col-span-2 rounded-md border border-black/10 bg-gradient-to-br from-[hsl(var(--brand-primary))]/15 to-[hsl(var(--brand-secondary))]/15 p-1.5 shadow-sm">
            <div className="h-1 w-6 rounded-full bg-[hsl(var(--brand-primary))]/60" />
            <div className="mt-1 h-2 w-10 rounded-full bg-black/25" />
          </div>
          <div className="rounded-md border border-black/10 bg-white shadow-sm" />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 rounded-md border border-black/10 bg-white shadow-sm" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div className="h-6 rounded-md border border-black/10 bg-white shadow-sm" />
          <div className="h-6 rounded-md border border-black/10 bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
