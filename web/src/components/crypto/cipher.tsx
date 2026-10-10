"use client";

import { cn } from "@/lib/utils";
import { useCipherText } from "./use-cipher-text";

interface CipherProps {
  /** The plaintext this ciphertext stands for (mock here; decrypted client-side in the real app). */
  value: string;
  revealed: boolean;
  seed: string;
  delay?: number;
  className?: string;
  /** Optional unit rendered after the value, never scrambled. */
  suffix?: string;
  /** Real ciphertext (hex) to show while encrypted. Without it the glyphs are a generated stand-in. */
  cipherText?: string;
  /**
   * The figure styles from DESIGN.md, so every page draws amounts the same way: `hero` is a card's headline amount,
   * `row` an amount in a list. Without it the value inherits its surroundings (inline and compact uses).
   */
  size?: "hero" | "row";
}

const SIZE = {
  hero: { value: "text-3xl sm:text-4xl font-bold tracking-tight text-foreground", suffix: "text-base sm:text-lg font-semibold" },
  row: { value: "text-sm font-semibold text-foreground", suffix: "text-xs font-semibold" },
} as const;

/**
 * A confidential value. Encrypted it is a block of hex glyphs the same width as the plaintext;
 * on reveal each glyph scrambles and locks into place, then flashes green once.
 */
export function Cipher({ value, revealed, seed, delay, className, suffix, cipherText, size }: CipherProps) {
  const { text, phase } = useCipherText({ plain: value, seed, revealed, delay, cipherText });
  const hidden = phase === "encrypted" || phase === "encrypting";
  return (
    <span
      className={cn(
        "relative inline-flex items-baseline gap-1.5 font-mono tnum whitespace-pre",
        size && SIZE[size].value,
        className,
      )}
    >
      <span
        key={phase === "decrypted" ? "done" : "busy"}
        role="text"
        aria-label={revealed ? `${value}${suffix ? ` ${suffix}` : ""}` : "Encrypted value"}
        data-phase={phase}
        className={cn(
          "rounded-[0.3em] px-[0.28em] -mx-[0.28em] transition-colors duration-300 ease-out-expo",
          hidden ? "bg-cipher text-cipher-ink" : "text-foreground",
          phase === "decrypting" && "bg-accent text-accent-foreground",
          phase === "decrypted" && "animate-[resolve-flash_900ms_var(--ease-out)]",
        )}
      >
        <span aria-hidden>{text}</span>
      </span>
      {suffix ? <span className={cn("text-muted-foreground font-sans", size ? SIZE[size].suffix : "text-[0.7em]")}>{suffix}</span> : null}
    </span>
  );
}
