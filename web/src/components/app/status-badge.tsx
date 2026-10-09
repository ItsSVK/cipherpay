import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-secondary/70 text-secondary-foreground border-border/70",
  verified: "bg-verified-soft text-verified border-verified/30",
  pending: "bg-pending-soft text-pending border-pending/30",
  failed: "bg-failed-soft text-destructive border-destructive/30",
  key: "bg-accent/80 text-accent-foreground border-primary/25",
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", children, pulse, className }: { tone?: Tone; children: React.ReactNode; pulse?: boolean; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium tracking-tight shadow-2xs transition-colors",
        TONES[tone],
        className
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full bg-current shrink-0", pulse && "[animation:dot-pulse_1.2s_ease-in-out_infinite]")}
      />
      <span>{children}</span>
    </Badge>
  );
}
