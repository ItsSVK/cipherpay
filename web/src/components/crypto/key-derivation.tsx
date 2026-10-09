"use client";

import type { ReactNode } from "react";
import { CheckIcon, FileTextIcon, FingerprintIcon, KeyRoundIcon, LockKeyholeIcon, XIcon } from "lucide-react";
import { type KeyMode, type KeyStatus } from "./key-context";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * One signature, two keys. The diagram is the real derivation: the wallet signs one fixed message, and
 * the ElGamal keypair and the AES key are both derived from that signature, in one step, inside this tab.
 * Only real values appear: the message text, and the public key once it exists. The signature and the AES
 * key are secrets and are never shown, only marked as present.
 *
 * Geometry: the SVG viewBox and the container share one aspect ratio, so node positions given as
 * percentages of the box land exactly on the path endpoints.
 */
const W = 360;
const H = 176;
const P = {
  msg: { x: 52, y: 78 },
  sig: { x: 168, y: 78 },
  elg: { x: 292, y: 34 },
  aes: { x: 292, y: 122 },
} as const;

const LINK_IN = `M${P.msg.x} ${P.msg.y} L${P.sig.x} ${P.sig.y}`;
const LINK_ELG = `M${P.sig.x} ${P.sig.y} C ${P.sig.x + 70} ${P.sig.y}, ${P.elg.x - 70} ${P.elg.y}, ${P.elg.x} ${P.elg.y}`;
const LINK_AES = `M${P.sig.x} ${P.sig.y} C ${P.sig.x + 70} ${P.sig.y}, ${P.aes.x - 70} ${P.aes.y}, ${P.aes.x} ${P.aes.y}`;

type NodeState = "idle" | "active" | "waiting" | "done" | "error";

const LABELS: Record<KeyMode, { input: [string, string]; source: string; idle: string }> = {
  signature: { input: ["Message", "solana-conf-bal/v1"], source: "Wallet signature", idle: "Sign the message to derive your keys." },
  import: { input: ["Auditor secret", "pasted, not stored"], source: "Secret key", idle: "Paste the auditor secret to rebuild its key." },
};

const short = (k: string) => (k.length > 12 ? `${k.slice(0, 5)}…${k.slice(-5)}` : k);

function Node({ at, state, icon, title, sub, delay = 0 }: { at: { x: number; y: number }; state: NodeState; icon: ReactNode; title: string; sub: ReactNode; delay?: number }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${(at.x / W) * 100}%`, top: `${(at.y / H) * 100}%` }}
    >
      <div className="relative">
        {state === "waiting" ? (
          <span className="absolute -inset-1.5 rounded-full border-2 border-dashed border-primary/50 animate-[spin_6s_linear_infinite]" aria-hidden />
        ) : null}
        <div
          key={state}
          style={{ animationDelay: `${delay}ms`, transitionDelay: `${delay}ms` }}
          className={cn(
            "relative grid size-10 place-items-center rounded-full border bg-card transition-[background-color,border-color,color] duration-300",
            state === "idle" && "border-border text-muted-foreground",
            state === "active" && "border-primary/50 bg-primary/10 text-primary",
            state === "waiting" && "border-primary/60 text-primary [animation:lock-pulse_1.6s_var(--ease-out)_infinite]",
            state === "done" && "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)_both]",
            state === "error" && "border-rose-300 bg-rose-50 text-rose-600",
          )}
        >
          {state === "error" ? <XIcon className="size-4" /> : icon}
        </div>
      </div>
      <div className="absolute top-full mt-1.5 flex flex-col items-center whitespace-nowrap text-center">
        <span className="text-[11px] font-medium text-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function Link({ d, on, color, delay = 0 }: { d: string; on: boolean; color: "primary" | "verified"; delay?: number }) {
  return (
    <>
      <path d={d} className="stroke-border" strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
      <path
        d={d}
        pathLength={1}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={1}
        strokeDashoffset={on ? 0 : 1}
        style={{ transition: `stroke-dashoffset 600ms var(--ease-out) ${delay}ms, stroke 300ms` }}
        className={color === "verified" ? "stroke-verified" : "stroke-primary"}
      />
    </>
  );
}

export function KeyDerivation({
  status,
  stage,
  seed,
  mode = "signature",
  error = null,
}: {
  status: KeyStatus;
  stage: number;
  /** The real ElGamal public key once derived; empty before that (and always for demo wallets). */
  seed: string;
  mode?: KeyMode;
  error?: string | null;
}) {
  const reduced = useReducedMotion();
  const labels = LABELS[mode];
  const ready = status === "ready";
  const deriving = status === "deriving";
  const failed = Boolean(error);
  // Stage 1 is the moment the signature came back: both keys exist from then on. The later "stages" are
  // only display beats in key-context, so the diagram does not pretend they are separate computations.
  const signed = ready || (deriving && stage >= 1);
  const waiting = deriving && !signed;
  const pubkey = seed.length > 10 ? seed : null;

  const caption = failed
    ? error
    : ready
      ? "Keys are in this tab's memory only. They are wiped when you lock or disconnect."
      : signed
        ? "Both keys come from that one signature, computed here in your browser."
        : waiting
          ? mode === "signature"
            ? "Approve the message in your wallet. Signing is free and sends nothing on-chain."
            : "Rebuilding the key from the secret…"
          : labels.idle;

  return (
    <div className="w-full min-w-0 space-y-3" aria-label="Key derivation">
      <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-transparent px-2 pt-3 pb-1">
        <div className="relative mx-auto w-full max-w-[420px]" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <Link d={LINK_IN} on={deriving || ready} color={signed ? "verified" : "primary"} />
            <Link d={LINK_ELG} on={signed} color="verified" />
            <Link d={LINK_AES} on={signed} color="verified" delay={160} />
            {waiting && !reduced ? (
              <circle r={3} className="fill-primary">
                <animateMotion dur="1.4s" repeatCount="indefinite" path={LINK_IN} />
              </circle>
            ) : null}
          </svg>

          <Node
            at={P.msg}
            state={deriving || ready ? "active" : "idle"}
            icon={<FileTextIcon className="size-4" />}
            title={labels.input[0]}
            sub={<span className={mode === "signature" ? "font-mono" : undefined}>{labels.input[1]}</span>}
          />
          <Node
            at={P.sig}
            state={failed ? "error" : signed ? "done" : waiting ? "waiting" : "idle"}
            icon={signed ? <CheckIcon className="size-4" strokeWidth={3} /> : <FingerprintIcon className="size-4" />}
            title={labels.source}
            sub={failed ? "declined" : signed ? "never leaves this tab" : waiting ? (mode === "signature" ? "approve in wallet" : "reading…") : "not yet signed"}
          />
          <Node
            at={P.elg}
            state={signed ? "done" : "idle"}
            delay={350}
            icon={<KeyRoundIcon className="size-4" />}
            title="ElGamal key"
            sub={pubkey && signed ? <span className="font-mono">{short(pubkey)}</span> : "decrypts amounts"}
          />
          <Node
            at={P.aes}
            state={signed ? "done" : "idle"}
            delay={510}
            icon={<LockKeyholeIcon className="size-4" />}
            title="AES key"
            sub={signed ? "sealed in memory" : "reads your balance"}
          />
        </div>
      </div>

      <p
        aria-live="polite"
        className={cn("flex items-start gap-2 text-xs leading-relaxed", failed ? "text-rose-700" : "text-muted-foreground")}
      >
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            failed ? "bg-rose-500" : ready || signed ? "bg-verified" : waiting ? "bg-primary animate-pulse" : "bg-muted-foreground/40",
          )}
        />
        <span>{caption}</span>
      </p>

      {pubkey && signed ? (
        <div className="enter-fade rounded-xl border border-border/80 bg-muted/20 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your public encryption key</p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">{pubkey}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Public and safe to share. Your treasury and payroll accounts are registered under this key.</p>
        </div>
      ) : null}
    </div>
  );
}

export function StageMark({ done, running }: { done: boolean; running: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] transition-[background-color,border-color,color] duration-300 ease-out-expo",
        done ? "border-verified bg-verified text-white [animation:pop_420ms_var(--ease-out)]" : running ? "border-primary text-primary" : "border-input text-muted-foreground",
      )}
    >
      {done ? (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      ) : running ? (
        <span className="size-2 rounded-full bg-primary [animation:dot-pulse_900ms_ease-in-out_infinite]" />
      ) : (
        <span className="size-1.5 rounded-full bg-input" />
      )}
    </span>
  );
}
