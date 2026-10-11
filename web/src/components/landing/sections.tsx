"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, EyeIcon, LandmarkIcon, SendIcon, WalletIcon } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { Cipher } from "@/components/crypto/cipher";
import { StatusBadge } from "@/components/app/status-badge";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtifactHeader, SAMPLE } from "./artifacts";
import { ScrollReveal, useInView, useScrollProgress } from "./scroll";

/* ------------------------------------------------------------------ Nav */

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,box-shadow] duration-300",
        scrolled ? "bg-white shadow-[0_1px_0_rgb(0_0_0/0.06)]" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Brand />
        <nav aria-label="Sections" className="hidden items-center gap-8 text-[15px] md:flex">
          <a href="#how" className="text-[var(--l-ink)] transition-opacity hover:opacity-60">How it works</a>
          <a href="#viewers" className="text-[var(--l-ink)] transition-opacity hover:opacity-60">Who sees what</a>
          <a href="#hidden" className="text-[var(--l-ink)] transition-opacity hover:opacity-60">What stays public</a>
        </nav>
        <div className="flex items-center gap-5">
          <Link href="/app/auditor" className="arrow-link hidden text-[15px] sm:inline">Auditor view</Link>
          <Link href="/app" className="pill pill-ink !h-10 !px-4 text-[14px]">
            Launch app
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ Who sees what */

export function ViewersSection({ demo }: { demo: React.ReactNode }) {
  return (
    <section id="viewers" aria-labelledby="viewers-title" className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-36">
      <div>
        <ScrollReveal variant="line">
          <h2 id="viewers-title" className="serif heading">
            Same payroll. <em className="italic">Three</em> different views.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <p className="mt-6 max-w-[30rem] text-[17px] leading-[1.55] text-[var(--l-slate)]">
            Addresses stay public, so anyone can check that payroll happened. The amounts are ciphertext, and only the right key opens each one.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={200} as="dl" className="mt-8 divide-y divide-black/[0.07] border-y border-black/[0.07]">
          {[
            { who: "The public", what: "Sees wallets and ciphertext. Never an amount." },
            { who: "Each employee", what: "Opens their own payments with their own wallet's key." },
            { who: "Your auditor", what: "Opens every payment with the mint's auditor key." },
          ].map((r) => (
            <div key={r.who} className="grid grid-cols-[9rem_1fr] gap-4 py-3.5 text-[15px]">
              <dt className="font-[480]">{r.who}</dt>
              <dd className="text-[var(--l-slate)]">{r.what}</dd>
            </div>
          ))}
        </ScrollReveal>
      </div>
      <ScrollReveal variant="scale" delay={150}>
        {demo}
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ What stays public */

const JOURNEY = [
  { icon: LandmarkIcon, step: "Fund", what: "USDC is wrapped into WUSDC and enters the vault.", public: true, note: "Anyone can see the company funded its treasury, and how much." },
  { icon: SendIcon, step: "Pay", what: "Vault to each employee wallet.", public: false, note: "Addresses are public. Amounts are ciphertext." },
  { icon: EyeIcon, step: "Audit", what: "The mint's auditor opens every payment.", public: false, note: "One auditor key per mint, held by your auditor." },
  { icon: WalletIcon, step: "Withdraw", what: "Back to a public balance and USDC, when the employee chooses.", public: true, note: "Public at that moment, and only for the amount they take." },
] as const;

export function JourneySection() {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState(0);
  useScrollProgress(ref, { mode: "cross", steps: 40, onChange: setQ });
  // The track draws while the section crosses the middle of the screen; each stop lights as the line reaches it.
  const drawn = Math.min(1, Math.max(0, (q - 0.22) / 0.3));
  const reached = (i: number) => drawn >= i / (JOURNEY.length - 1) - 0.001;

  return (
    <section id="hidden" aria-labelledby="hidden-title" className="bg-[var(--l-fog)]">
      <div ref={ref} className="mx-auto w-full max-w-[1200px] px-4 py-24 sm:px-6 lg:py-36">
        <div className="max-w-[44rem]">
          <ScrollReveal variant="line">
            <h2 id="hidden-title" className="serif heading">
              Exactly what is hidden, <em className="italic">and what is not.</em>
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={120}>
            <p className="mt-6 text-[17px] leading-[1.55] text-[var(--l-slate)]">
              The transfer is encrypted. Putting money in and taking it out are not. We would rather tell you that up front than imply a secrecy the
              chain doesn&apos;t give.
            </p>
          </ScrollReveal>
        </div>

        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6" aria-label="The money's path">
          {/* Track: horizontal on wide screens, vertical on phones */}
          <span aria-hidden className="absolute top-5 right-[12.5%] left-[12.5%] hidden h-px bg-black/10 md:block" />
          <span
            aria-hidden
            className="absolute top-5 left-[12.5%] hidden h-px origin-left bg-[var(--l-ink)] transition-transform duration-500 ease-out-expo md:block"
            style={{ width: "75%", transform: `scaleX(${drawn})` }}
          />
          <span aria-hidden className="absolute top-5 bottom-5 left-5 w-px bg-black/10 md:hidden" />
          <span
            aria-hidden
            className="absolute top-5 bottom-5 left-5 w-px origin-top bg-[var(--l-ink)] transition-transform duration-500 ease-out-expo md:hidden"
            style={{ transform: `scaleY(${drawn})` }}
          />
          {JOURNEY.map((j, i) => {
            const on = reached(i);
            const Icon = j.icon;
            return (
              <li key={j.step} className="relative grid grid-cols-[2.5rem_1fr] gap-4 md:grid-cols-1 md:justify-items-center md:text-center">
                <span
                  className={cn(
                    "relative z-10 grid size-10 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-500",
                    on ? (j.public ? "border-[var(--l-ink)] bg-[var(--l-ink)] text-white" : "border-primary bg-primary text-white") : "border-black/15 bg-white text-[var(--l-ash)]",
                    on && "scale-105",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className={cn("transition-[opacity,transform] duration-700 ease-out-expo md:mt-1", on ? "opacity-100" : "translate-y-2 opacity-40")}>
                  <p className="text-[20px] font-[480] tracking-[-0.01em]">{j.step}</p>
                  <p className="mt-1 text-[15px] text-[var(--l-ink)]">{j.what}</p>
                  <div className="mt-3">
                    <StatusBadge tone={j.public ? "pending" : "key"}>{j.public ? "Public amount" : "Encrypted"}</StatusBadge>
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.5] text-[var(--l-slate)] md:mx-auto md:max-w-[15rem]">{j.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Disclosure (the page's one peach card) */

function useCountTo(target: number, active: boolean, ms = 1400) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      setV(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, ms, reduced]);
  return reduced ? target : v;
}

export function DisclosureSection() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { amount: 0.45 });
  const UNIT = 1_000_000;
  const total = Number(SAMPLE.sam.pay / BigInt(UNIT));
  const take = useCountTo(1000, seen);
  const pct = (take / total) * 100;

  return (
    <section aria-labelledby="disclosure-title" className="mx-auto w-full max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
      <ScrollReveal variant="scale">
        <div ref={ref} className="grid items-center gap-12 rounded-[24px] bg-[var(--l-peach)] px-6 py-12 text-[var(--l-sienna)] sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-16 lg:py-20">
          <div>
            <h2 id="disclosure-title" className="serif heading">
              Disclosure is <em className="italic">your</em> choice.
            </h2>
            <p className="mt-6 max-w-[30rem] text-[17px] leading-[1.55] text-[var(--l-sienna)]/85">
              Withdrawing turns encrypted pay back into a public balance, and that moment is visible on-chain. So taking part of it, later, is the default:
              withdraw what you need and leave the rest encrypted. What you reveal, and when, is up to you.
            </p>
            <Link href="/app" className="arrow-link mt-8 inline-flex items-center gap-1.5 text-[16px] font-[450]">
              Open My pay <ArrowRightIcon className="size-4" />
            </Link>
          </div>

          <div className="artifact mx-auto w-full max-w-[400px] p-5 text-[var(--l-ink)]">
            <ArtifactHeader title="Withdraw" meta="Sam's wallet · sample" right={<StatusBadge tone="verified">Keys unlocked</StatusBadge>} />
            <div className="mt-4 rounded-xl bg-[var(--l-fog)] p-3.5">
              <p className="text-[11px] text-[var(--l-slate)]">Encrypted balance</p>
              <Cipher value={formatUsdc(SAMPLE.sam.pay)} seed="withdraw-bal" revealed suffix="WUSDC" className="mt-1 text-[22px] font-semibold tracking-tight" />
            </div>
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-medium">Amount to withdraw</span>
                <span className="font-mono tnum text-[15px] font-semibold">{take.toLocaleString("en-US")}.00</span>
              </div>
              <div className="relative mt-2.5 h-2 rounded-full bg-cipher" aria-hidden>
                <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--l-ink)]" style={{ width: `${pct}%` }} />
                <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--l-ink)] bg-white shadow-sm" style={{ left: `${pct}%` }} />
              </div>
            </div>
            <dl className="mt-5 divide-y divide-black/[0.06] text-[13px]">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-2">
                  Becomes public <StatusBadge tone="pending" className="hidden sm:inline-flex">Public</StatusBadge>
                </dt>
                <dd className="font-mono tnum font-medium whitespace-nowrap">{take.toLocaleString("en-US")}.00 USDC</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-2">
                  Stays encrypted <StatusBadge tone="key" className="hidden sm:inline-flex">Encrypted</StatusBadge>
                </dt>
                <dd className="font-mono tnum font-medium whitespace-nowrap">{(total - take).toLocaleString("en-US")}.00</dd>
              </div>
            </dl>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ Under the hood */

const FACTS = [
  { term: "Token-2022 confidential transfers", desc: "Balances and amounts live on Solana as ElGamal ciphertext. Our programs move them; they never see the numbers." },
  { term: "Proofs built in your browser", desc: "Three zero-knowledge proofs per payment, generated in a background worker in the tab and verified on-chain." },
  { term: "Keys from one signature", desc: "Your wallet signs one fixed message. The keys are derived from it, held in memory, and cleared when you lock or disconnect." },
  { term: "One approval for a whole run", desc: "Automatic payroll authorises a helper key for a few minutes and a fixed number of payments. It can pay, and nothing else." },
  { term: "Runs that resume", desc: "Every payment is tracked on its own. A failed one retries alone; a confirmed one is never paid twice." },
  { term: "Sealed records", desc: "Amounts in your saved payrolls are encrypted in your browser before they reach our server." },
] as const;

export function FactsSection() {
  return (
    <section aria-labelledby="facts-title" className="mx-auto w-full max-w-[1200px] px-4 pb-24 sm:px-6 lg:pb-36">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <ScrollReveal variant="line" className="self-start lg:sticky lg:top-28">
          <h2 id="facts-title" className="serif heading">
            Built on what the chain <em className="italic">already checks.</em>
          </h2>
        </ScrollReveal>
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {FACTS.map((f, i) => (
            <ScrollReveal key={f.term} delay={(i % 2) * 90} className="border-t border-black/[0.08] py-6">
              <dt className="text-[17px] font-[480] tracking-[-0.005em]">{f.term}</dt>
              <dd className="mt-2 text-[15px] leading-[1.55] text-[var(--l-slate)]">{f.desc}</dd>
            </ScrollReveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Close + footer */

export function ClosingSection() {
  return (
    <section aria-labelledby="close-title" className="border-t border-black/[0.06] bg-[var(--l-mist)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center px-4 py-24 text-center sm:px-6 lg:py-32">
        <ScrollReveal variant="line">
          <h2 id="close-title" className="serif heading-lg max-w-[16ch]">
            See payday from <em className="italic">your</em> side.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <p className="mt-6 max-w-[32rem] text-[17px] leading-[1.55] text-[var(--l-slate)]">
            Connect a devnet wallet to set up a vault and pay someone, or to receive and open your own pay.
          </p>
        </ScrollReveal>
        <ScrollReveal delay={200} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/app" className="pill pill-ink">
            Launch app <ArrowRightIcon className="size-4" />
          </Link>
          <Link href="/app/auditor" className="pill pill-ghost">
            Open the auditor view
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-10 text-[14px] text-[var(--l-slate)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <Brand />
      <p>Confidential payroll on Solana devnet. Not audited; don&apos;t use real funds.</p>
      <p className="text-[var(--l-ink)]">Built on Token-2022 confidential transfers.</p>
    </footer>
  );
}
