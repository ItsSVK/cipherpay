"use client";

import { ViewTransition, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

/*
 * The one header shared by the three public surfaces: the landing page, the wallet front door (connect + sign-in) and the audit log.
 * Every piece is a named <ViewTransition>, so a navigation between them reads as ONE header changing shape rather than two headers
 * swapping: the brand stays put, the background and the right-hand actions morph into each other, and the landing's section links
 * unmask from the centre on the way in and fold back into it on the way out. Keyframes: "Site header" block in globals.css.
 * Route navigations are React transitions, so this needs no wiring at the call sites; browsers without the View Transitions API
 * just swap instantly.
 */
export function SiteHeader({
  surface,
  center,
  actions,
}: {
  /** "landing" is transparent at the top of the page and turns white once scrolled; "app" is the paper bar with a hairline. */
  surface: "landing" | "app";
  center?: React.ReactNode;
  /** Must render a single element (it is what morphs). */
  actions: React.ReactNode;
}) {
  const scrolled = useScrolled(surface === "landing");
  return (
    <header className={cn("sticky top-0", surface === "landing" ? "z-50" : "z-30")}>
      <ViewTransition name="site-header-surface" share="site-morph" default="none">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-[background-color,box-shadow] duration-300",
            surface === "app"
              ? "border-b border-border/60 bg-background/80 backdrop-blur-md"
              : scrolled
                ? "bg-[var(--l-paper)] shadow-[0_1px_0_var(--l-hairline)]"
                : "bg-transparent",
          )}
        />
      </ViewTransition>
      <div className="relative mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <ViewTransition name="site-brand" share="site-morph" default="none">
          <Brand href="/" />
        </ViewTransition>
        {/* Always present, so the landing's links pair with an empty anchor at the centre of the other headers. Next keeps the
            previous route mounted (hidden) instead of unmounting it, so enter/exit never fire across routes; a shared pair does. */}
        <ViewTransition name="site-center" share="site-center" default="none">
          {center ?? <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-y-1/2" />}
        </ViewTransition>
        <div className="flex items-center gap-3">
          <ViewTransition name="site-actions" share="site-actions" default="none">
            {actions}
          </ViewTransition>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Right-hand side of the app surfaces: the network badge and one link out. */
export function NetworkActions({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 shadow-2xs text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-verified [animation:dot-pulse_2s_ease-in-out_infinite]" />
        <span>Solana Devnet</span>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-all hover:bg-muted/70 hover:border-primary/40 active:scale-[0.98]"
      >
        {label}
        <ArrowRightIcon className="size-3.5 text-primary" />
      </Link>
    </div>
  );
}

function useScrolled(enabled: boolean) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [enabled]);
  return scrolled;
}
