"use client";

/*
 * Light / dark theme. The source of truth is the `dark` class on <html>, set BEFORE first paint by THEME_INIT_SCRIPT (layout.tsx),
 * so there is no flash and no hydration state to reconcile. The only thing stored is the choice ("light" | "dark") under
 * STORAGE_KEY; with nothing stored the OS preference decides. Never put keys or anything secret here.
 *
 * Switching is a view transition: the new theme is revealed as a circle (clip-path) growing out of the toggle (see the "Theme
 * switch" block in globals.css). Browsers without the View Transitions API, and reduced-motion users, get an instant switch
 * (or a short colour fade) with the same result.
 */
export type Theme = "light" | "dark";

export const STORAGE_KEY = "cipherpay:theme";
export const THEME_COLOR: Record<Theme, string> = { light: "#f6f6f3", dark: "#0f1115" };

/** Runs inline in <head> before the first paint. Keep it tiny and dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var d=document.documentElement;if(t==="dark")d.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}")}catch(e){}})()`;

const EVENT = "cipherpay:theme";
const WAVE_MS = 800;

export function subscribeTheme(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
export const readTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
export const readThemeServer = (): Theme => "light";

function apply(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[next]);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode / blocked storage: the choice just lasts for this page
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Switch theme. `origin` is where the wave starts (the toggle's centre, in viewport pixels). */
export function setTheme(next: Theme, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  if (readTheme() === next) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return apply(next);

  const start = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void> } }).startViewTransition;
  if (!start) {
    // No View Transitions: fade the colours of everything for a moment instead.
    root.classList.add("theme-fade");
    apply(next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 450);
    return;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = origin?.x ?? w / 2;
  const y = origin?.y ?? 0;
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  root.dataset.themeSwitch = next; // "to" theme; selects the dark/light flavour of the effect

  const t = start.call(document, () => apply(next));
  t.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
      { duration: WAVE_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both", pseudoElement: "::view-transition-new(root)" },
    );
  }, () => {});
  const done = () => {
    delete root.dataset.themeSwitch;
  };
  t.finished.then(done, done);
}
