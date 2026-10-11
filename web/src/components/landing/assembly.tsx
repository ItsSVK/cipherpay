"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { makeCipher } from "@/components/crypto/use-cipher-text";
import { KeysArtifact, ProofListArtifact, RecipientArtifact, SAMPLE, TreasuryArtifact } from "./artifacts";
import { ScrollReveal, useInView, useScrollProgress } from "./scroll";
import { formatUsdc } from "@/lib/format";

/**
 * "One payment, assembled." A pinned section: as the visitor scrolls, each step of a real confidential payment adds
 * its piece to one board (treasury, keys, proofs, the encrypted transfer, the recipient), until the whole picture is
 * on screen. Nothing is removed along the way. Phones get the same steps in flow, each with its own piece.
 */

const STEPS = [
  {
    title: "Fund the treasury",
    body: "Wrap USDC into WUSDC and deposit it into the vault's confidential balance. This part is public: anyone can see the company funded its treasury.",
  },
  {
    title: "Unlock your keys",
    body: "Your wallet signs one fixed message. Your ElGamal and AES keys are derived from that signature inside the tab, and never leave it.",
  },
  {
    title: "Prove, without revealing",
    body: "For each payment your browser builds three zero-knowledge proofs. The chain checks them. It never sees the amount.",
  },
  {
    title: "Send it encrypted",
    body: "pay_employee moves the amount from the vault to the employee's wallet. An explorer shows two addresses and ciphertext.",
  },
  {
    title: "Open it with the right key",
    body: "Sam decrypts Sam's pay. The auditor decrypts every payment. Everyone else keeps seeing ciphertext.",
  },
] as const;

/* Board geometry, in board pixels. The board is drawn at this size and scaled to its column. */
const W = 680;
const H = 610;
const SLOT = {
  treasury: { x: 0, y: 14, w: 290, h: 150 },
  keys: { x: 360, y: 0, w: 320, h: 118 },
  proofs: { x: 196, y: 196, w: 300, h: 214 },
  recipient: { x: 380, y: 446, w: 300, h: 160 },
} as const;
const RAIL = `M64 172 L64 478 Q64 526 112 526 L372 526`;
const KEY_LINK = `M520 126 C 520 160, 470 160, 450 188`;
const PROOF_LINK = `M188 300 C 140 300, 110 300, 72 300`;

/** How far into the last step the recipient decrypts (and the last bullet fills). */
const REVEAL_AT = 0.15;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function Slot({ at, on, children }: { at: { x: number; y: number; w: number; h: number }; on: boolean; children: ReactNode }) {
  return (
    <div className="absolute" style={{ left: at.x, top: at.y, width: at.w }}>
      <div
        aria-hidden
        className={cn("absolute inset-x-0 top-0 rounded-[20px] border border-dashed border-l-ink/15 transition-opacity duration-500", on ? "opacity-0" : "opacity-100")}
        style={{ height: at.h }}
      />
      <div
        className="transition-[opacity,transform,filter] duration-[900ms] ease-out-expo"
        style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(18px) scale(0.96)", filter: on ? "none" : "blur(6px)" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Draws an SVG path to `progress` (0..1), via pathLength so any path length works. */
function DrawnPath({ d, progress, className, dashed }: { d: string; progress: number; className: string; dashed?: boolean }) {
  return (
    <>
      <path d={d} fill="none" className="stroke-l-ink/12" strokeWidth={1.5} strokeDasharray="3 5" />
      <path
        d={d}
        fill="none"
        pathLength={1}
        strokeWidth={dashed ? 1.5 : 2}
        strokeLinecap="round"
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        className={className}
        style={{ transition: "stroke-dashoffset 500ms var(--ease-out)" }}
      />
    </>
  );
}

function Board({ step, t }: { step: number; t: number }) {
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1.1, e.contentRect.width / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const local = (i: number) => (step > i ? 1 : step === i ? t : 0);
  const keysT = local(1);
  const proofT = local(2);
  const railT = clamp01(local(3) / 0.75);
  const packetVisible = step === 3 && railT > 0 && railT < 1 && !reduced;
  const cipher = makeCipher(formatUsdc(SAMPLE.sam.pay), "rail").slice(0, 6);

  return (
    <div ref={wrap} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <DrawnPath d={KEY_LINK} progress={clamp01(local(2) * 3)} className="stroke-primary/60" dashed />
          <DrawnPath d={PROOF_LINK} progress={clamp01((local(2) - 0.75) * 4)} className="stroke-verified" />
          <DrawnPath d={RAIL} progress={railT} className="stroke-primary" />
        </svg>
        {/* The encrypted amount travelling the rail: real-looking ciphertext, never the number. */}
        <div
          aria-hidden
          className={cn(
            "absolute top-0 left-0 rounded-md bg-cipher px-1.5 py-0.5 font-mono text-[11px] text-cipher-ink shadow-sm ring-1 ring-primary/15 transition-opacity duration-300",
            packetVisible ? "opacity-100" : "opacity-0",
          )}
          style={{ offsetPath: `path("${RAIL}")`, offsetDistance: `${railT * 100}%`, offsetRotate: "0deg", transition: "offset-distance 500ms var(--ease-out), opacity 300ms" }}
        >
          {cipher}…
        </div>
        <Slot at={SLOT.treasury} on={step >= 0}>
          <TreasuryArtifact />
        </Slot>
        <Slot at={SLOT.keys} on={step >= 1}>
          <KeysArtifact t={keysT} />
        </Slot>
        <Slot at={SLOT.proofs} on={step >= 2}>
          <ProofListArtifact t={proofT} />
        </Slot>
        <Slot at={SLOT.recipient} on={step >= 3}>
          <RecipientArtifact arrived={railT >= 1} revealed={step >= 4 && t > REVEAL_AT} />
        </Slot>
      </div>
    </div>
  );
}

/** Ramps 0 -> 1 over `ms` once `active`, in tenths (for the phone layout, where each piece plays on its own). */
function useRamp(active: boolean, ms = 1800) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(p * 10) / 10);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, reduced]);
  return reduced ? 1 : v;
}

function PhoneStep({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { amount: 0.5 });
  const t = useRamp(seen);
  const piece =
    index === 0 ? (
      <TreasuryArtifact className="w-full max-w-[340px]" />
    ) : index === 1 ? (
      <KeysArtifact t={t} className="w-full max-w-[340px]" />
    ) : index === 2 ? (
      <ProofListArtifact t={t} className="w-full max-w-[340px]" />
    ) : (
      <RecipientArtifact arrived={index === 4 || t >= 1} revealed={index === 4 && t > 0.4} className="w-full max-w-[340px]" />
    );
  return (
    <div ref={ref} className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
      <ScrollReveal>
        <h3 className="text-[22px] font-[480] tracking-[-0.01em]">{STEPS[index].title}</h3>
        <p className="mt-2 max-w-[30rem] text-[16px] leading-[1.5] text-[var(--l-slate)]">{STEPS[index].body}</p>
      </ScrollReveal>
      <ScrollReveal variant="scale" delay={120} className="justify-self-center">
        {piece}
      </ScrollReveal>
    </div>
  );
}

export function Assembly() {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState(0);
  useScrollProgress(ref, { mode: "through", steps: 240, onChange: setQ });

  // Six beats: an empty board, then one per step. The last step keeps a short hold so the full picture rests.
  const beats = STEPS.length + 1;
  const raw = Math.min(q * beats * 1.06, beats - 0.001);
  const step = Math.floor(raw) - 1;
  const t = raw - Math.floor(raw);

  return (
    <section id="how" aria-labelledby="how-title" className="relative">
      {/* Desktop: pinned board */}
      <div ref={ref} className="relative hidden lg:block" style={{ height: `${beats * 95 + 40}vh` }}>
        <div className="sticky top-0 flex h-svh items-center">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-14 px-6 pt-14">
            <div>
              <h2 id="how-title" className="serif heading-lg">
                One payment, <em className="italic">assembled</em> as you scroll.
              </h2>
              <ol className="relative mt-10 space-y-1 pl-7">
                <span aria-hidden className="absolute top-2 bottom-2 left-[7px] w-px bg-l-ink/10" />
                <span aria-hidden className="absolute top-2 bottom-2 left-[7px] w-px origin-top bg-[var(--l-ink)]" style={{ transform: "scaleY(var(--p, 0))" }} />
                {STEPS.map((s, i) => {
                  const state = step > i ? "done" : step === i ? "now" : "next";
                  // Nothing comes after the last step, so it fills the moment its piece lands (the recipient decrypts),
                  // instead of staying hollow forever.
                  const filled = state === "done" || (state === "now" && i === STEPS.length - 1 && t > REVEAL_AT);
                  return (
                    <li key={s.title} className="relative py-2" aria-current={state === "now" ? "step" : undefined}>
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-[15px] -left-7 size-[15px] rounded-full border-2 bg-[var(--l-raised)] transition-[border-color,background-color,transform] duration-500",
                          state === "next" ? "border-l-ink/15" : "border-[var(--l-ink)]",
                          filled && "bg-[var(--l-ink)]",
                          state === "now" && !filled && "scale-110",
                        )}
                      />
                      <p className={cn("text-[20px] font-[450] tracking-[-0.01em] transition-colors duration-500", state === "next" ? "text-[var(--l-ash)]" : "text-[var(--l-ink)]")}>
                        {s.title}
                      </p>
                      <div className="grid transition-[grid-template-rows] duration-700 ease-out-expo" style={{ gridTemplateRows: state === "now" ? "1fr" : "0fr" }}>
                        <div className="overflow-hidden">
                          <p className={cn("max-w-[28rem] pt-1.5 text-[16px] leading-[1.5] text-[var(--l-slate)] transition-opacity duration-500", state === "now" ? "opacity-100" : "opacity-0")}>
                            {s.body}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className={cn("mt-8 text-[13px] text-[var(--l-ash)] transition-opacity duration-500", step < 0 ? "opacity-100" : "opacity-0")}>Scroll to build it.</p>
            </div>
            <div className="rounded-[24px] bg-[var(--l-mist)] p-6 xl:p-8">
              <Board step={step} t={t} />
            </div>
          </div>
        </div>
      </div>

      {/* Phones and tablets: the same steps in flow */}
      <div className="mx-auto max-w-[760px] px-4 py-20 sm:px-6 lg:hidden">
        <ScrollReveal variant="line">
          <h2 className="serif heading-lg">
            One payment, <em className="italic">assembled.</em>
          </h2>
        </ScrollReveal>
        <div className="mt-12 space-y-16">
          {STEPS.map((s, i) => (
            <PhoneStep key={s.title} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
