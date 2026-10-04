"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const HEX = "0123456789abcdef";
const make = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");

/** A line of hex that churns while `active`. Decorative: hidden from assistive tech. */
export function HexTicker({ active, length = 28, className }: { active: boolean; length?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [text, setText] = useState("0".repeat(length));
  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setText(make(length)), 70);
    return () => clearInterval(id);
  }, [active, reduced, length]);
  return (
    <span aria-hidden className={cn("font-mono tnum text-[11px] tracking-wider transition-opacity duration-300", active ? "text-primary opacity-100" : "text-muted-foreground opacity-40", className)}>
      {active ? text : "0".repeat(length)}
    </span>
  );
}
