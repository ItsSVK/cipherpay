import { cn } from "@/lib/utils";

/** A padlock whose shackle lifts and swings when `open`. One drawn SVG so the motion is smooth. */
export function LockIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} aria-hidden>
      <path
        d="M8 11V7.5a4 4 0 0 1 8 0V11"
        style={{
          transformOrigin: "16px 11px",
          transform: open ? "translateY(-2.5px) rotate(24deg)" : "none",
          transition: "transform 420ms var(--ease-out)",
        }}
      />
      <rect x="5" y="11" width="14" height="9.5" rx="2.2" />
      <circle cx="12" cy="15.7" r="1" fill="currentColor" stroke="none" style={{ transition: "transform 300ms var(--ease-out)", transform: open ? "scale(0.6)" : "scale(1)", transformOrigin: "12px 15.7px" }} />
    </svg>
  );
}
