import { hashString, seededRandom, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

// Flat, desaturated hues. A fingerprint is five colour blocks derived from the string, so
// the same address always looks the same without us showing any key material.
const HUES = [277, 150, 70, 220, 20, 190, 320, 100];

export function Fingerprint({ seed, className, size = 14 }: { seed: string; className?: string; size?: number }) {
  const rand = seededRandom(hashString(seed));
  const blocks = Array.from({ length: 5 }, () => HUES[Math.floor(rand() * HUES.length)]);
  return (
    <span
      aria-hidden
      className={cn("inline-grid grid-cols-5 overflow-hidden rounded-[3px] ring-1 ring-border", className)}
      style={{ width: size * 2.5, height: size }}
    >
      {blocks.map((h, i) => (
        <span key={i} style={{ background: `oklch(0.72 0.1 ${h})` }} />
      ))}
    </span>
  );
}

export function Address({
  value,
  className,
  head = 4,
  tail = 4,
  showFingerprint = false,
}: {
  value: string;
  className?: string;
  head?: number;
  tail?: number;
  showFingerprint?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[0.8em]", className)} title={value}>
      {showFingerprint ? <Fingerprint seed={value} /> : null}
      <span className="tnum">{shortAddress(value, head, tail)}</span>
    </span>
  );
}
