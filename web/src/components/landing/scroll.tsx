"use client";

import { type CSSProperties, type ElementType, Fragment, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Scroll primitives for the landing page. Nothing here re-renders per frame: continuous values are written to a CSS
 * variable (`--p`) on the element, and React only hears about coarse changes (a new step, a quantised progress value).
 */

/**
 * Progress of `ref` through the viewport, 0..1, written to `--p` on the element every frame it changes.
 * `mode: "through"` runs 0 -> 1 while the element's top travels from the viewport top to its own bottom leaving
 * (a pinned, taller-than-viewport section). `mode: "exit"` runs 0 -> 1 as the element scrolls up out of view from rest.
 * `mode: "cross"` runs 0 -> 1 while the element crosses the viewport.
 * `onChange` receives the value quantised to `steps` (so callers re-render only when it moves a notch).
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  { mode = "through", steps = 100, onChange }: { mode?: "through" | "cross" | "exit"; steps?: number; onChange?: (p: number) => void } = {},
) {
  const reduced = useReducedMotion();
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = -1;
    let lastQ = -1;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const raw =
        mode === "through" ? -r.top / Math.max(1, r.height - vh) : mode === "exit" ? -r.top / Math.max(1, r.height) : (vh - r.top) / (vh + r.height);
      const p = Math.min(1, Math.max(0, raw));
      if (Math.abs(p - last) > 0.0005) {
        last = p;
        el.style.setProperty("--p", p.toFixed(4));
      }
      const q = Math.round(p * steps) / steps;
      if (q !== lastQ) {
        lastQ = q;
        cb.current?.(q);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, mode, steps, reduced]);
}

/** True once the element has been at least `amount` visible. Stays true (`once`) or follows visibility. */
export function useInView(ref: RefObject<HTMLElement | null>, { amount = 0.35, once = true, margin = "0px" }: { amount?: number; once?: boolean; margin?: string } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { threshold: amount, rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, once, margin]);
  return inView;
}

/**
 * Rises, sharpens and fades in the first time it scrolls into view. Server markup is fully visible; the element is
 * only hidden ("armed") after mount, and only if it is still below the fold, so nothing above the fold ever blinks.
 * `variant="line"` unmasks from the bottom (for headings), `"scale"` adds a slight scale for artifacts.
 */
export function ScrollReveal({
  children,
  as,
  className,
  delay = 0,
  variant = "rise",
  style,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  variant?: "rise" | "line" | "scale";
  style?: CSSProperties;
}) {
  const Tag = as ?? "div";
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.reveal = "armed";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "in";
        io.disconnect();
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <Tag ref={ref} data-variant={variant} className={cn(className)} style={{ ...style, ["--rd" as string]: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** A heading whose words rise out of a mask on page load (hero only). Keeps the full text for assistive tech. */
export function RisingWords({ text, start = 0, className }: { text: string; start?: number; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span aria-hidden className="word">
            <span style={{ ["--w" as string]: start + i }}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}
