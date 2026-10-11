"use client";

import { useRef, useState } from "react";
import { Check, Globe, KeyRound, Lock, ShieldCheck, Unlock } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Address } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { LockIcon } from "@/components/crypto/lock-icon";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useScrollProgress } from "./scroll";

export type Lens = "public" | "employee" | "auditor";

export const LENS_ORDER: Lens[] = ["public", "employee", "auditor"];

export const PAYROLL_ROWS = [
  {
    id: "e1",
    name: "Sam Okafor",
    role: "Lead Protocol Eng",
    initials: "SO",
    wallet: "3kT9bWmQe7YxHn2VcLpR5aZsD8uFj4gNoK6tXyP1vBqE",
    salary: 10_000_000_000n,
  },
  {
    id: "e2",
    name: "Priya Nair",
    role: "Zero-Knowledge Lead",
    initials: "PN",
    wallet: "9mPz4cXvL2dJqR8nWbT6yHsK3eA7uFo1gNtY5xVhQkBw",
    salary: 6_800_000_000n,
  },
  {
    id: "e3",
    name: "Mateo Ruiz",
    role: "Smart Contracts Eng",
    initials: "MR",
    wallet: "5hGq8wNzT3vXcP2rLmY9bKdA6sJeU4oFt7nHxVyQ1kBa",
    salary: 7_200_000_000n,
  },
  {
    id: "e4",
    name: "Aiko Tanaka",
    role: "Product Systems",
    initials: "AT",
    wallet: "7vLn3sDzP9mQcX4wTbR2yHkA8eJgU6oFt5NxVhY1qKaB",
    salary: 5_400_000_000n,
  },
] as const;

export const LENS_COPY: Record<
  Lens,
  {
    title: string;
    subtitle: string;
    body: string;
    keyLabel: string;
    badge: string;
    accent: string;
  }
> = {
  public: {
    title: "Public Explorer View",
    subtitle: "Solana Devnet Block Explorer",
    body: "Anyone on-chain sees that the vault transferred tokens to four wallets. Every single payroll amount is sealed ElGamal ciphertext.",
    keyLabel: "No Key · Ciphertext",
    badge: "Public Ledger",
    accent: "text-[var(--l-slate)]",
  },
  employee: {
    title: "Employee View · Sam Okafor",
    subtitle: "Client-side private key decryption",
    body: "Sam's browser uses his signature-derived ElGamal key to open his $10,000.00 USDC transfer. Priya, Mateo, and Aiko's compensation stays completely sealed.",
    keyLabel: "Sam's Private Key",
    badge: "1 of 4 Decrypted",
    accent: "text-verified",
  },
  auditor: {
    title: "Auditor View · Compliance Officer",
    subtitle: "Mint-wide compliance auditor key",
    body: "The compliance officer holds the mint's auditor key, decrypting all payments for tax and regulatory filings without making any record public.",
    keyLabel: "Mint Auditor Key",
    badge: "Full Compliance",
    accent: "text-primary",
  },
};

export interface LensDemoProps {
  lens?: Lens;
  progress?: number;
  onLensChange?: (lens: Lens) => void;
  className?: string;
}

export function LensDemo({ lens: controlledLens, progress: controlledProgress, onLensChange, className }: LensDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalLens, setInternalLens] = useState<Lens>("public");
  const [internalProgress, setInternalProgress] = useState(0);
  const reduced = useReducedMotion();

  // If not externally controlled, drive from scroll crossing the viewport
  useScrollProgress(containerRef, {
    mode: "cross",
    steps: 60,
    onChange: (p) => {
      if (controlledLens !== undefined) return;
      setInternalProgress(p);
      // Map cross progress 0.25 -> 0.75 across the 3 lenses
      const normalized = Math.min(1, Math.max(0, (p - 0.2) / 0.6));
      const stepIndex = normalized < 0.34 ? 0 : normalized < 0.67 ? 1 : 2;
      setInternalLens(LENS_ORDER[stepIndex]);
    },
  });

  const activeLens = controlledLens ?? internalLens;
  const activeIndex = LENS_ORDER.indexOf(activeLens);
  const progressRatio = controlledProgress !== undefined ? controlledProgress : (activeIndex / (LENS_ORDER.length - 1));

  const handleSelectLens = (target: Lens) => {
    onLensChange?.(target);
    if (controlledLens === undefined) {
      setInternalLens(target);
    }
  };

  const currentCopy = LENS_COPY[activeLens];

  return (
    <div
      ref={containerRef}
      className={cn(
        "artifact overflow-hidden border border-l-ink/[0.08]",
        className,
      )}
    >
      {/* Top Bar / Header */}
      <div className="relative border-b border-l-ink/[0.07] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-2 items-center justify-center">
                <span
                  className={cn(
                    "size-2 rounded-full transition-colors duration-500",
                    activeLens === "public" && "bg-[var(--l-ash)]",
                    activeLens === "employee" && "bg-verified",
                    activeLens === "auditor" && "bg-primary",
                  )}
                />
              </span>
              <p className="text-[11px] font-semibold tracking-wider text-[var(--l-slate)] uppercase">
                Confidential Payroll Run #1024
              </p>
            </div>
            <h3 className="mt-0.5 text-[17px] font-semibold tracking-tight text-[var(--l-ink)]">
              October Distribution
            </h3>
            <p className="text-xs text-[var(--l-slate)]">
              4 payees · 29,400.00 USDC total · Solana Devnet
            </p>
          </div>

          {/* Scroll-Synced View Selector Pills */}
          <div className="flex items-center gap-1 self-start rounded-full bg-[var(--l-mist)] p-1 sm:self-center">
            {LENS_ORDER.map((item) => {
              const isActive = activeLens === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleSelectLens(item)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300",
                    isActive
                      ? "bg-[var(--l-raised)] text-[var(--l-ink)] shadow-sm"
                      : "text-[var(--l-slate)] hover:text-[var(--l-ink)]",
                  )}
                >
                  {item === "public" && <Globe className={cn("size-3.5", isActive ? "text-[var(--l-ink)]" : "opacity-60")} />}
                  {item === "employee" && <KeyRound className={cn("size-3.5", isActive ? "text-verified" : "opacity-60")} />}
                  {item === "auditor" && <ShieldCheck className={cn("size-3.5", isActive ? "text-primary" : "opacity-60")} />}
                  <span className="capitalize">{item}</span>
                  {isActive && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        item === "public" && "bg-[var(--l-slate)]",
                        item === "employee" && "bg-verified",
                        item === "auditor" && "bg-primary",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Micro Scroll Progress Bar */}
        <div className="mt-3.5 h-[2px] w-full overflow-hidden rounded-full bg-l-ink/[0.05]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out-expo",
              activeLens === "public" && "bg-[var(--l-ink)]",
              activeLens === "employee" && "bg-verified",
              activeLens === "auditor" && "bg-primary",
            )}
            style={{
              width: `${Math.max(12, Math.min(100, (progressRatio) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Table Column Sub-headers */}
      <div className="hidden grid-cols-[1.4fr_1fr_1.1fr] border-b border-l-ink/[0.06] bg-[var(--l-fog)] px-5 py-2 text-[10px] font-semibold tracking-wider text-[var(--l-slate)] uppercase sm:grid sm:px-6">
        <div>Recipient & Key</div>
        <div>Cipher Status</div>
        <div className="text-right">Confidential Amount</div>
      </div>

      {/* Payroll Rows */}
      <ul className="divide-y divide-l-ink/[0.06]">
        {PAYROLL_ROWS.map((e, i) => {
          const revealed = activeLens === "auditor" || (activeLens === "employee" && i === 0);
          const isSam = i === 0;

          return (
            <li
              key={e.id}
              className={cn(
                "group/row relative flex flex-col gap-2.5 px-5 py-3.5 transition-colors duration-300 sm:grid sm:grid-cols-[1.4fr_1fr_1.1fr] sm:items-center sm:gap-4 sm:px-6",
                revealed
                  ? "bg-verified-soft/40 hover:bg-verified-soft/60"
                  : "bg-[var(--l-raised)] hover:bg-[var(--l-fog)]/60",
              )}
            >
              {/* Left Accent indicator for active row */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-[3px] transition-all duration-300",
                  revealed ? "bg-verified opacity-100" : "bg-transparent opacity-0",
                )}
              />

              {/* Recipient info & wallet */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-300",
                    revealed
                      ? "bg-verified-soft text-verified ring-1 ring-verified/30"
                      : "bg-[var(--l-mist)] text-[var(--l-slate)]",
                  )}
                >
                  {e.initials}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold tracking-tight text-[var(--l-ink)]">
                      {activeLens === "public" ? `Payee #${i + 1}` : e.name}
                    </p>
                    {revealed && (
                      <span className="grid size-3.5 place-items-center rounded-full bg-verified text-white">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Address value={e.wallet} showFingerprint className="text-xs text-[var(--l-slate)]" />
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center">
                {revealed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-verified-soft px-2.5 py-0.5 text-[11px] font-medium text-verified ring-1 ring-verified/25">
                    <Unlock className="size-3 text-verified" />
                    <span>{activeLens === "auditor" ? "Audited" : "Unlocked with Key"}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--l-mist)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--l-slate)] ring-1 ring-l-ink/[0.04]">
                    <Lock className="size-3 opacity-60" />
                    <span>{activeLens === "employee" && !isSam ? "Sealed for Others" : "ElGamal Cipher"}</span>
                  </span>
                )}
              </div>

              {/* Cipher / Amount Column */}
              <div className="flex items-center justify-between sm:justify-end">
                <span className="text-xs text-[var(--l-slate)] sm:hidden">Amount:</span>
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[14px] font-semibold tabular-nums transition-colors duration-300",
                    revealed ? "text-[var(--l-ink)] font-bold" : "text-[var(--l-slate)]",
                  )}
                >
                  <Cipher
                    value={formatUsdc(e.salary)}
                    seed={`landing-redesign-${e.id}`}
                    revealed={revealed}
                    delay={reduced ? 0 : i * 90}
                    suffix="USDC"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Bottom Cryptographic Insight Drawer */}
      <div className="relative border-t border-l-ink/[0.07] bg-[var(--l-fog)] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span
              className={cn(
                "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-300",
                activeLens === "public" && "bg-[var(--l-raised)] text-[var(--l-slate)] ring-1 ring-l-ink/[0.08]",
                activeLens === "employee" && "bg-verified-soft text-verified ring-1 ring-verified/20",
                activeLens === "auditor" && "bg-accent text-accent-foreground ring-1 ring-primary/20",
              )}
            >
              <LockIcon open={activeLens !== "public"} className="size-4" />
            </span>

            <div key={activeLens} className="enter-fade min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold tracking-tight text-[var(--l-ink)]">
                  {currentCopy.title}
                </p>
                <span
                  className={cn(
                    "hidden rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase sm:inline-block",
                    activeLens === "public" && "bg-[var(--l-mist)] text-[var(--l-slate)]",
                    activeLens === "employee" && "bg-verified-soft text-verified",
                    activeLens === "auditor" && "bg-accent text-accent-foreground",
                  )}
                >
                  {currentCopy.badge}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--l-slate)]">
                {currentCopy.body}
              </p>
            </div>
          </div>

          {/* Active Key Pill */}
          <div className="shrink-0 self-start sm:self-center">
            <div className="flex items-center gap-1.5 rounded-full border border-l-ink/[0.08] bg-[var(--l-raised)] px-3 py-1 shadow-xs">
              <KeyRound className={cn("size-3.5", currentCopy.accent)} />
              <span className="font-mono text-[11px] font-medium text-[var(--l-ink)]">
                {currentCopy.keyLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
