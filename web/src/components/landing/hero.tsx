"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { Cursor, LedgerArtifact, PaymentArtifact, ProofFlowArtifact, RunComposerArtifact } from "./artifacts";
import { RisingWords, useInView, useScrollProgress } from "./scroll";

/**
 * Centred serif headline with four product fragments floating around it (LANDING_DESIGN "hero pattern").
 * On load the words rise and the fragments float in from their own side; on scroll the headline lifts away and
 * each fragment drifts at its own speed, so the page parts like layers.
 */

/** Three nested layers so the three motions never fight over one `transform`: scroll drift, entrance, idle bob. */
function Floating({ children, speed, enterFrom, delay, bob = 0, className }: { children: ReactNode; speed: number; enterFrom: [string, string]; delay: number; bob?: number; className?: string }) {
  return (
    <div className={cn("absolute will-change-transform", className)} style={{ transform: `translate3d(0, calc(var(--p, 0) * ${speed}px), 0)` }}>
      <div className="float-in" style={{ ["--fx" as string]: enterFrom[0], ["--fy" as string]: enterFrom[1], ["--fd" as string]: `${delay}ms` } as CSSProperties}>
        <div className="bob" style={{ animationDelay: `${bob}ms` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Loops while visible: a payment that opens with its owner's key, then seals again. */
function useLoop(active: boolean, periodMs: number, ticks: number) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % ticks), periodMs);
    return () => window.clearInterval(id);
  }, [active, reduced, periodMs, ticks]);
  return reduced ? ticks - 1 : tick;
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref, { mode: "exit", steps: 1 });
  const visible = useInView(ref, { amount: 0.05, once: false });
  const reveal = useLoop(visible, 2600, 2);
  const proofTick = useLoop(visible, 700, 7);

  return (
    <section ref={ref} className="relative overflow-x-clip" aria-labelledby="hero-title">
      <div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:h-[min(900px,calc(100svh-4rem))] lg:min-h-[760px]">
        {/* Fragments (desktop composition) */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
          <Floating className="top-[9%] -left-2 xl:-left-10" speed={-140} enterFrom={["-40px", "10px"]} delay={500}>
            <LedgerArtifact />
          </Floating>
          <Floating className="top-[6%] -right-2 xl:-right-8" speed={-90} enterFrom={["40px", "10px"]} delay={650} bob={900}>
            <PaymentArtifact revealed={reveal === 1} />
          </Floating>
          <Floating className="bottom-[9%] left-[2%] xl:-left-2" speed={-200} enterFrom={["-30px", "40px"]} delay={800} bob={400}>
            <ProofFlowArtifact t={(proofTick + 1) / 6} />
          </Floating>
          <Floating className="right-[4%] bottom-[12%] xl:right-0" speed={-60} enterFrom={["30px", "40px"]} delay={950} bob={1600}>
            <RunComposerArtifact />
          </Floating>
          <div className="float-in absolute right-[25%] bottom-[25%]" style={{ ["--fd" as string]: "1400ms" } as CSSProperties}>
            <Cursor initials="AD" label="Admin" tone="key" className="cursor-drift" />
          </div>
          <div className="float-in absolute top-[30%] left-[21%]" style={{ ["--fd" as string]: "1600ms" } as CSSProperties}>
            <Cursor
              initials="AU"
              label="Auditor"
              tone="verified"
              className="cursor-drift"
              style={{ ["--cd" as string]: "11s", ["--cx1" as string]: "-18px", ["--cy1" as string]: "12px" } as CSSProperties}
            />
          </div>
        </div>

        {/* Headline */}
        <div
          className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center pt-16 pb-14 text-center sm:pt-24 lg:h-full lg:justify-center lg:pt-0 lg:pb-8"
          style={{ opacity: "calc(1 - var(--p, 0) * 1.4)", transform: "translate3d(0, calc(var(--p, 0) * 90px), 0) scale(calc(1 - var(--p, 0) * 0.04))" }}
        >
          <h1 id="hero-title" className="serif display text-[var(--l-ink)]">
            <RisingWords text="Payroll the public" />
            <br />
            <em className="italic">
              <RisingWords text="can't read." start={3} />
            </em>
          </h1>
          <p className="float-in mt-7 max-w-[34rem] text-[18px] leading-[1.45] text-[var(--l-slate)] sm:text-[20px]" style={{ ["--fd" as string]: "420ms" } as CSSProperties}>
            Pay your whole team in one approved run on Solana. Amounts are encrypted on-chain: each employee opens their own pay, your auditor opens all of
            it, everyone else sees ciphertext.
          </p>
          <div className="float-in mt-9 flex flex-wrap items-center justify-center gap-3" style={{ ["--fd" as string]: "560ms" } as CSSProperties}>
            <Link href="/app" className="pill pill-ink">
              Launch app <ArrowRightIcon className="size-4" />
            </Link>
            <a href="#how" className="pill pill-ghost">
              See a payment
            </a>
          </div>
          <p className="float-in mt-6 text-[13px] text-[var(--l-ash)]" style={{ ["--fd" as string]: "700ms" } as CSSProperties}>
            Devnet only · not audited · names and amounts on this page are samples
          </p>
        </div>
      </div>

      {/* Fragments (phones and tablets): two, in flow, under the headline */}
      <div className="mx-auto grid max-w-[600px] justify-items-center gap-5 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:hidden" aria-hidden>
        <div className="float-in" style={{ ["--fd" as string]: "800ms" } as CSSProperties}>
          <LedgerArtifact className="max-w-full" />
        </div>
        <div className="float-in" style={{ ["--fd" as string]: "950ms" } as CSSProperties}>
          <PaymentArtifact revealed={reveal === 1} className="max-w-full" />
        </div>
      </div>
    </section>
  );
}
