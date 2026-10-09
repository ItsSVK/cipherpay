import { HexTicker } from "@/components/crypto/hex-ticker";

/**
 * Shown while a real wallet's devnet state is being read, so a page never flashes the wrong state first.
 * Fades in after a short delay so a fast read never flickers a loader at all.
 */
export function PageLoading({ label = "Reading devnet…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="enter-fade flex min-h-[50vh] flex-col items-center justify-center px-4 text-center"
      style={{ animationDelay: "180ms" }}
    >
      <div className="relative grid size-14 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-primary/15" style={{ animation: "orb-ripple 1.8s var(--ease-out) infinite" }} />
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-primary/10" style={{ animation: "orb-ripple 1.8s var(--ease-out) 0.9s infinite" }} />
        <span className="relative grid size-14 place-items-center rounded-2xl border border-primary/15 bg-accent text-accent-foreground shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
            <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
            <path d="m4 7 8 4 8-4M12 11v10" />
          </svg>
        </span>
      </div>

      <p className="mt-6 text-sm font-semibold tracking-tight text-foreground">{label}</p>
      <HexTicker active length={24} className="mt-2" />

      <div aria-hidden className="relative mt-5 h-[2px] w-40 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-primary/70" style={{ animation: "sweep 1.3s var(--ease-out) infinite" }} />
      </div>
    </div>
  );
}
