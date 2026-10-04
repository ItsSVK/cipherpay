import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-secondary text-secondary-foreground",
  verified: "bg-verified-soft text-verified",
  pending: "bg-pending-soft text-pending",
  failed: "bg-failed-soft text-destructive",
  key: "bg-accent text-accent-foreground",
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone = "neutral", children, pulse, className }: { tone?: Tone; children: React.ReactNode; pulse?: boolean; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("h-[22px] gap-1.5 px-2 text-[11.5px] font-medium", TONES[tone], className)}>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full bg-current", pulse && "[animation:dot-pulse_1.1s_ease-in-out_infinite]")}
      />
      {children}
    </Badge>
  );
}
