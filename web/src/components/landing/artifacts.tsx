"use client";

import type { ReactNode } from "react";
import { CheckIcon, FileTextIcon, FingerprintIcon, KeyRoundIcon, LockKeyholeIcon, ScaleIcon, ShieldCheckIcon, SigmaIcon } from "lucide-react";
import { Address } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { Flow, type FlowState } from "@/components/crypto/flow";
import { LockIcon } from "@/components/crypto/lock-icon";
import { StatusBadge } from "@/components/app/status-badge";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Product fragments for the landing page: small, faithful pieces of the real app (same Cipher, Flow, badges and
 * colours), floated on white like screenshots. All people, wallets and amounts here are made up.
 */

export const SAMPLE = {
  sam: { name: "Sam Okafor", wallet: "3kT9bWmQe7YxHn2VcLpR5aZsD8uFj4gNoK6tXyP1vBqE", pay: 4_200_000_000n },
  payees: [
    { id: "p1", wallet: "3kT9bWmQe7YxHn2VcLpR5aZsD8uFj4gNoK6tXyP1vBqE", pay: 4_200_000_000n },
    { id: "p2", wallet: "9mPz4cXvL2dJqR8nWbT6yHsK3eA7uFo1gNtY5xVhQkBw", pay: 6_800_000_000n },
    { id: "p3", wallet: "5hGq8wNzT3vXcP2rLmY9bKdA6sJeU4oFt7nHxVyQ1kBa", pay: 7_250_000_000n },
  ],
  funded: 25_000_000_000n,
} as const;

export function ArtifactHeader({ title, meta, right }: { title: string; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold tracking-tight">{title}</p>
        {meta ? <p className="truncate text-[11px] text-[var(--l-slate)]">{meta}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** The vault paying three wallets, as anyone on an explorer sees it: addresses in the clear, amounts as ciphertext. */
export function LedgerArtifact({ className }: { className?: string }) {
  return (
    <div className={cn("artifact w-[272px] p-4", className)}>
      <ArtifactHeader title="October payroll" meta="3 wallets · public view" right={<StatusBadge tone="key">Encrypted</StatusBadge>} />
      <ul className="mt-3 space-y-1">
        {SAMPLE.payees.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--l-fog)] px-2.5 py-2">
            <Address value={p.wallet} className="text-[12px] text-[var(--l-slate)]" />
            <Cipher value={formatUsdc(p.pay)} seed={`hero-${p.id}`} revealed={false} className="text-[12px]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One received payment that the employee's own key opens. `revealed` is driven by the caller. */
export function PaymentArtifact({ revealed, className }: { revealed: boolean; className?: string }) {
  return (
    <div className={cn("artifact w-[272px] p-4", className)}>
      <ArtifactHeader
        title="Payment received"
        meta={<Address value={SAMPLE.sam.wallet} className="text-[11px]" />}
        right={
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-500",
              revealed ? "bg-verified-soft text-verified" : "bg-cipher text-cipher-ink",
            )}
          >
            <LockIcon open={revealed} className="size-3.5" />
          </span>
        }
      />
      <div className="mt-4">
        <Cipher value={formatUsdc(SAMPLE.sam.pay)} seed="hero-sam" revealed={revealed} suffix="USDC" className="text-[26px] font-semibold tracking-tight" />
      </div>
      <p className="mt-2 text-[11px] text-[var(--l-slate)]">{revealed ? "Opened with Sam's key, inside this tab." : "Sealed. Only Sam and the auditor can open it."}</p>
    </div>
  );
}

const PROOFS = [
  { key: "eq", label: "Equality", icon: <SigmaIcon />, detail: "New balance matches" },
  { key: "val", label: "Validity", icon: <ShieldCheckIcon />, detail: "Encrypted correctly" },
  { key: "rng", label: "Range", icon: <ScaleIcon />, detail: "Nothing goes negative" },
] as const;

function stateAt(t: number, start: number, end: number): FlowState {
  return t >= end ? "done" : t >= start ? "active" : "idle";
}

/** The three zero-knowledge proofs as a `Flow`. `t` 0..1 moves through them. */
export function ProofFlowArtifact({ t, className }: { t: number; className?: string }) {
  const steps = PROOFS.map((p, i) => ({ key: p.key, icon: p.icon, label: p.label, state: stateAt(t, i * 0.25, i * 0.25 + 0.25) }));
  const all = t >= 0.75;
  return (
    <div className={cn("artifact w-[300px] p-4", className)}>
      <ArtifactHeader
        title="Proofs for one payment"
        meta="Built in your browser"
        right={all ? <StatusBadge tone="verified">Verified</StatusBadge> : <StatusBadge tone="key" pulse>Proving</StatusBadge>}
      />
      <Flow steps={steps} label="Zero-knowledge proofs" className="mt-4 justify-between" />
    </div>
  );
}

/** Proofs as a checklist: what each one establishes, ticking off in turn. `t` 0..1. */
export function ProofListArtifact({ t, className }: { t: number; className?: string }) {
  return (
    <div className={cn("artifact w-[300px] p-4", className)}>
      <ArtifactHeader title="Zero-knowledge proofs" meta="Built in your browser" right={t >= 0.8 ? <StatusBadge tone="verified">On-chain</StatusBadge> : null} />
      <ul className="mt-3 space-y-2">
        {PROOFS.map((p, i) => {
          const s = stateAt(t, i * 0.24, i * 0.24 + 0.22);
          return (
            <li key={p.key} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-500", s === "active" ? "bg-accent/60" : "bg-[var(--l-fog)]")}>
              <span
                className={cn(
                  "relative grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-300 [&_svg]:size-3.5",
                  s === "idle" && "border-border bg-white text-muted-foreground",
                  s === "active" && "border-primary/50 bg-primary/10 text-primary",
                  s === "done" && "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)_both]",
                )}
              >
                {s === "active" ? <span className="absolute -inset-1 rounded-full border-2 border-dashed border-primary/35 animate-[spin_6s_linear_infinite]" aria-hidden /> : null}
                {s === "done" ? <CheckIcon strokeWidth={3} /> : p.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium leading-tight">{p.label} proof</p>
                <p className="text-[11px] text-[var(--l-slate)]">{p.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The treasury: funding is public, the balance is ciphertext. */
export function TreasuryArtifact({ className }: { className?: string }) {
  return (
    <div className={cn("artifact w-[290px] p-4", className)}>
      <ArtifactHeader title="Vault treasury" meta="WUSDC · confidential" right={<StatusBadge tone="pending">Funding is public</StatusBadge>} />
      <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--l-fog)] px-2.5 py-2 text-[12px]">
        <span className="text-[var(--l-slate)]">Wrapped & deposited</span>
        <span className="font-mono tnum font-medium">+{formatUsdc(SAMPLE.funded)} USDC</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--l-slate)]">Balance on-chain</span>
        <Cipher value={formatUsdc(SAMPLE.funded)} seed="treasury" revealed={false} className="text-[15px] font-semibold" />
      </div>
    </div>
  );
}

/** One wallet signature in, two keys out. `t` 0..1. */
export function KeysArtifact({ t, className }: { t: number; className?: string }) {
  const steps = [
    { key: "msg", icon: <FileTextIcon />, label: "Message", state: (t > 0.05 ? "done" : "idle") as FlowState },
    { key: "sig", icon: <FingerprintIcon />, label: "Signature", state: (t > 0.45 ? "done" : t > 0.05 ? "waiting" : "idle") as FlowState },
    { key: "elg", icon: <KeyRoundIcon />, label: "ElGamal", state: (t > 0.6 ? "done" : "idle") as FlowState },
    { key: "aes", icon: <LockKeyholeIcon />, label: "AES", state: (t > 0.7 ? "done" : "idle") as FlowState },
  ];
  return (
    <div className={cn("artifact w-[320px] p-4", className)}>
      <ArtifactHeader title="Your keys" meta={<span className="font-mono">signs “solana-conf-bal/v1”</span>} right={t > 0.7 ? <StatusBadge tone="verified">In this tab</StatusBadge> : <StatusBadge tone="key" pulse={t > 0.05}>Locked</StatusBadge>} />
      <Flow steps={steps} label="Key derivation" className="mt-4 justify-between" />
    </div>
  );
}

/** The recipient's wallet with three viewers of the same payment. `revealed` opens it. */
export function RecipientArtifact({ arrived, revealed, className }: { arrived: boolean; revealed: boolean; className?: string }) {
  const amount = formatUsdc(SAMPLE.sam.pay);
  return (
    <div className={cn("artifact w-[300px] p-4", className)}>
      <ArtifactHeader
        title={SAMPLE.sam.name}
        meta={<Address value={SAMPLE.sam.wallet} className="text-[11px]" />}
        right={<StatusBadge tone={revealed ? "verified" : arrived ? "key" : "neutral"}>{revealed ? "Decrypted" : arrived ? "Pending" : "Waiting"}</StatusBadge>}
      />
      <div className="mt-3">
        <Cipher value={amount} seed="stage-sam" revealed={revealed} suffix="USDC" className="text-[22px] font-semibold tracking-tight" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-1.5 text-[10.5px]">
        {[
          { who: "Public", sees: "Ciphertext", open: false },
          { who: "Sam", sees: "Own pay", open: revealed },
          { who: "Auditor", sees: "Every payment", open: revealed },
        ].map((v) => (
          <div key={v.who} className={cn("rounded-lg px-2 py-1.5 transition-colors duration-500", v.open ? "bg-verified-soft" : "bg-[var(--l-fog)]")}>
            <dt className="font-medium">{v.who}</dt>
            <dd className={cn("transition-colors duration-500", v.open ? "text-verified" : "text-[var(--l-slate)]")}>{v.open ? v.sees : "Sealed"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Approve & run" composer: the admin's one action, with a dark round send button (Steep's composer). */
export function RunComposerArtifact({ className }: { className?: string }) {
  return (
    <div className={cn("artifact w-[340px] p-2.5", className)}>
      <div className="flex items-center gap-3 rounded-2xl border border-[#ececec] bg-white py-2 pr-2 pl-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">Approve & run October payroll</p>
          <p className="truncate text-[11px] text-[var(--l-slate)]">3 people · simulated · nothing moves before this</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--l-ink)] text-white" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/** A multiplayer-style cursor with an avatar bubble (LANDING_DESIGN "Avatar Bubble"). */
export function Cursor({ initials, label, tone, className, style }: { initials: string; label: string; tone: "key" | "verified"; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("pointer-events-none flex items-start gap-1", className)} style={style} aria-hidden>
      <svg viewBox="0 0 16 16" className={cn("mt-0.5 size-4 drop-shadow-sm", tone === "key" ? "text-primary" : "text-verified")}>
        <path d="M2 1.5 13.5 7 8 8.5 6 14Z" fill="currentColor" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className={cn("mt-3 flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[11px] font-medium shadow-sm ring-1 ring-black/5", tone === "key" ? "bg-accent text-accent-foreground" : "bg-verified-soft text-verified")}>
        <span className={cn("grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white", tone === "key" ? "bg-primary" : "bg-verified")}>{initials}</span>
        {label}
      </span>
    </div>
  );
}
