import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a real wallet's devnet state is being read, so a page never flashes the wrong state first. */
export function PageLoading({ label = "Reading devnet…" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="pb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <p className="mt-4 text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}
