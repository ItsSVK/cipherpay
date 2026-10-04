"use client";

import { useEffect, useRef, useState } from "react";
import { hashString, seededRandom } from "@/lib/format";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const GLYPHS = "0123456789abcdef";
const NOISE = "0123456789abcdef#%&*+=<>/\\|~";

/** Deterministic ciphertext of the same length as `plain`, so layout never shifts and SSR matches. */
export function makeCipher(plain: string, seed: string): string {
  const rand = seededRandom(hashString(`${seed}:${plain}`));
  return Array.from(plain, () => GLYPHS[Math.floor(rand() * GLYPHS.length)]).join("");
}

export type CipherPhase = "encrypted" | "decrypting" | "decrypted" | "encrypting";

interface Options {
  plain: string;
  seed: string;
  revealed: boolean;
  /** Delay before this value starts (ms): lets a whole table decrypt as a wave. */
  delay?: number;
  /** Time each character takes to lock in (ms). */
  perChar?: number;
}

interface Anim {
  text: string;
  phase: "decrypting" | "encrypting";
}

/**
 * Drives the scramble. Characters resolve left to right: while unresolved they flicker through
 * noise glyphs, then lock to their target (plaintext when revealing, ciphertext when hiding).
 * At rest the hook returns the target directly, so SSR and first paint always match.
 */
export function useCipherText({ plain, seed, revealed, delay = 0, perChar = 70 }: Options) {
  const reduced = useReducedMotion();
  const cipher = makeCipher(plain, seed);
  const target = revealed ? plain : cipher;
  const key = `${revealed}|${plain}|${seed}`;

  const [anim, setAnim] = useState<Anim | null>(null);
  const [prevKey, setPrevKey] = useState(key);
  // The target changed: begin the animation in this same render, so there is no one-frame flash of the end state.
  if (prevKey !== key) {
    setPrevKey(key);
    setAnim(reduced ? null : { text: revealed ? cipher : plain, phase: revealed ? "decrypting" : "encrypting" });
  }

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduced) return;

    let raf = 0;
    let start = 0;
    let lastNoise = 0;
    let noise = target;
    const len = target.length;
    const total = len * perChar * 0.55 + 380;
    const phase: Anim["phase"] = revealed ? "decrypting" : "encrypting";

    const tick = (now: number) => {
      if (!start) start = now + delay;
      const t = now - start;
      if (t < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (t >= total) {
        setAnim(null);
        return;
      }
      if (now - lastNoise > 48) {
        lastNoise = now;
        noise = Array.from(target, () => NOISE[Math.floor(Math.random() * NOISE.length)]).join("");
      }
      const resolved = Math.min(len, Math.floor((t / total) * (len + 2)));
      setAnim({ text: target.slice(0, resolved) + noise.slice(resolved), phase });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Restart only when the displayed value or reveal state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  const phase: CipherPhase = anim ? anim.phase : revealed ? "decrypted" : "encrypted";
  return { text: anim ? anim.text : target, phase };
}
