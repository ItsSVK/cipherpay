"use client";

import { useId, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { readTheme, readThemeServer, setTheme, subscribeTheme } from "@/lib/theme/theme";

/*
 * Sun <-> moon button. The icon's states are plain CSS keyed on the `dark` class on <html> (`.theme-toggle` block in globals.css),
 * so it is correct on the very first paint and morphs by itself: the sun's core grows while a masking circle slides in to carve the
 * crescent, and the rays fold in and spin away. Clicking starts the page-wide wave from the button's centre (lib/theme/theme.ts).
 */
export function ThemeToggle({ className, size = "default" }: { className?: string; size?: "default" | "sm" }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, readThemeServer);
  const ref = useRef<HTMLButtonElement>(null);
  const maskId = useId();
  const dark = theme === "dark";

  function toggle() {
    const r = ref.current?.getBoundingClientRect();
    setTheme(dark ? "light" : "dark", r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
  }

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={cn("theme-toggle", size === "sm" && "theme-toggle--sm", className)}
    >
      <span aria-hidden className="theme-toggle-halo" />
      <svg viewBox="0 0 24 24" aria-hidden className="theme-toggle-icon" fill="none">
        <mask id={maskId}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle className="theme-toggle-cut" cx="26" cy="-2" r="8" fill="black" />
        </mask>
        <circle className="theme-toggle-core" cx="12" cy="12" r="4.75" fill="currentColor" mask={`url(#${maskId})`} />
        <g className="theme-toggle-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="2" x2="12" y2="4.5" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}
