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
}

/**
 * A confidential value. Encrypted it is a block of hex glyphs the same width as the plaintext;
 * on reveal each glyph scrambles and locks into place, then flashes green once.
 */
export function Cipher({ value, revealed, seed, delay, className, suffix, cipherText }: CipherProps) {
  const { text, phase } = useCipherText({ plain: value, seed, revealed, delay, cipherText });
  const hidden = phase === "encrypted" || phase === "encrypting";
  return (
    <span
      className={cn(
        "relative inline-flex items-baseline gap-1.5 font-mono tnum whitespace-pre",
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
      {suffix ? <span className="text-muted-foreground text-[0.7em] font-sans">{suffix}</span> : null}
    </span>
  );
}
