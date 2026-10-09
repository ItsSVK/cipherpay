"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ExternalLinkIcon, FileTextIcon, FingerprintIcon, RadioTowerIcon, XIcon } from "lucide-react";
import { Flow } from "@/components/crypto/flow";
import type { RunStatus } from "@/lib/mock/data";
import type { RecipientRun } from "@/lib/payroll/use-run-simulation";
import { cn } from "@/lib/utils";

/** Opens and closes its children by animating the grid row from 0fr to 1fr, so height follows content with no measuring. */
export function Reveal({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden={!open}
      className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0", className)}
      // Closed content must not be reachable by keyboard.
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** The run's lifecycle as one vertical rail. The connector under each reached step draws down; the current step pulses. */
export function PhaseRail({ flow, current }: { flow: { id: RunStatus; label: string }[]; current: RunStatus }) {
  const idx = flow.findIndex((s) => s.id === current);
  return (
    <ol className="grid" aria-label="Run status">
      {flow.map((s, i) => {
        // "Done" is terminal: arriving there completes it, so it shows as a check, not as a step in progress.
        const finished = i === idx && s.id === "done";
        const reached = i < idx || finished;
        const here = i === idx && !finished;
        const failed = here && s.id === "failed";
        const last = i === flow.length - 1;
        return (
          <li key={s.id} className="grid grid-cols-[18px_1fr] gap-x-3" aria-current={here ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "relative grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color] duration-500 ease-out-expo",
                  reached && "border-verified bg-verified text-white",
                  here && !failed && "border-primary bg-card [animation:lock-pulse_1.6s_var(--ease-out)_infinite]",
                  failed && "border-destructive bg-destructive text-white",
                  !reached && !here && "border-input bg-card",
                )}
              >
                {reached ? (
                  <CheckIcon className="size-2.5 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={4} />
                ) : failed ? (
                  <XIcon className="size-2.5" strokeWidth={4} />
                ) : here ? (
                  <span className="size-1.5 rounded-full bg-primary" />
                ) : null}
              </span>
              {!last ? (
                <span className="relative my-0.5 min-h-3 w-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="absolute inset-0 origin-top bg-verified transition-transform duration-700 ease-out-expo"
                    style={{ transform: `scaleY(${reached ? 1 : 0})` }}
                  />
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                "pb-4 pt-px text-xs leading-[18px] transition-colors duration-300",
                here || finished ? (failed ? "font-semibold text-destructive" : "font-semibold text-foreground") : reached ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One bar segment per recipient, coloured by that recipient's real state, so "who has been paid" reads at a glance.
 * The running segment fills by its completed stages.
 */
export function RecipientBar({ rows, stageCount }: { rows: RecipientRun[]; stageCount: number }) {
  return (
    <div className="flex h-2 gap-1" aria-hidden>
      {rows.map((r) => (
        <span key={r.id} className="relative flex-1 overflow-hidden rounded-full bg-secondary">
          <span
            className={cn(
              "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-out-expo",
              r.status === "done" ? "bg-verified" : r.status === "failed" ? "bg-destructive" : "bg-primary",
            )}
            style={{ transform: `scaleX(${r.status === "done" || r.status === "failed" ? 1 : r.completed / stageCount})` }}
          />
        </span>
      ))}
    </div>
  );
}

const SIGNED_HOLD_MS = 1400;

/**
 * The wallet-approval moment. Appears when the engine reports a wallet request with a deadline (devnet keeps a transaction
 * valid for ~40 s), drains a bar toward that real deadline, and churns a signature line. When the request is answered and
 * the payment carries on, the card turns into a short "Signed" confirmation, then closes. A declined or expired request
 * (the row fails) just closes.
 */
export function SignaturePrompt({ rows, nameOf }: { rows: RecipientRun[]; nameOf: (id: string) => string }) {
  const active = rows.find((r) => r.deadline);
  const deadline = active?.deadline;

  // The row whose request we last showed, so we can tell "signed" (it carries on) from "declined" (it fails) once it closes.
  const [last, setLast] = useState<string | null>(null);
  const [signed, setSigned] = useState<{ id: string; n: number } | null>(null);
  if (active && last !== active.id) setLast(active.id);
  if (!active && last) {
    const row = rows.find((r) => r.id === last);
    setLast(null);
    if (row && row.status !== "failed") setSigned({ id: last, n: (signed?.n ?? 0) + 1 });
  }
  useEffect(() => {
    if (!signed) return;
    const t = setTimeout(() => setSigned(null), SIGNED_HOLD_MS);
    return () => clearTimeout(t);
  }, [signed]);

  // The bar drains from when this request appeared to its real deadline.
  const [clock, setClock] = useState<{ deadline: number; from: number; now: number } | null>(null);
  useEffect(() => {
    if (!deadline) return;
    let from = 0;
    const tick = () => {
      const now = Date.now();
      from ||= now;
      setClock({ deadline, from, now });
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [deadline]);

  const showSigned = !active && !!signed;
  const live = clock && clock.deadline === deadline ? clock : null;
  const left = live ? Math.max(0, live.deadline - live.now) : null;
  const fraction = live && left !== null ? Math.min(1, left / Math.max(1, live.deadline - live.from)) : 1;
  const secs = left === null ? null : Math.ceil(left / 1000);
  const urgent = secs !== null && secs <= 10;

  return (
    <Reveal open={!!active || showSigned}>
      <div className="px-5 pt-4 sm:px-6">
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "relative overflow-hidden rounded-2xl border p-4 transition-colors duration-500",
            showSigned ? "border-verified/30 bg-verified-soft/60" : "border-primary/25 bg-accent/40",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-semibold text-foreground">
              {showSigned && signed ? `Signed · ${nameOf(signed.id)}` : active ? `Approve in your wallet · ${nameOf(active.id)}` : "Approve in your wallet"}
            </p>
            {secs !== null && active ? (
              <span className={cn("font-mono text-xs tnum", urgent ? "text-pending" : "text-muted-foreground")}>{secs > 0 ? `${secs}s left` : "Expired, asking again…"}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {showSigned ? "Sent to devnet. Waiting for it to confirm." : (active?.note ?? "Your wallet is asking for one approval.")}
          </p>
          {/* Where this transaction is: built here, waiting on your wallet, then on devnet. */}
          <Flow
            size="md"
            label="Transaction progress"
            className="mx-auto mt-4 max-w-md"
            steps={[
              { key: "tx", icon: <FileTextIcon />, label: "pay_employee", sub: "built in this tab", state: "done" },
              { key: "wallet", icon: <FingerprintIcon />, label: "Your wallet", sub: showSigned ? "signed" : "approve the request", state: showSigned ? "done" : "waiting" },
              { key: "net", icon: <RadioTowerIcon />, label: "Devnet", sub: showSigned ? "confirming" : "not sent yet", state: showSigned ? "active" : "idle" },
            ]}
          />
          {active ? (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/10" aria-hidden>
              <span
                className={cn("absolute inset-y-0 left-0 w-full origin-left transition-transform duration-200 ease-linear", urgent ? "bg-pending" : "bg-primary")}
                style={{ transform: `scaleX(${fraction})` }}
              />
            </span>
          ) : null}
        </div>
      </div>
    </Reveal>
  );
}

const shortSig = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;

/** The pay_employee signature once the payment lands, linking to the explorer. Nothing is shown before that. */
export function TxSlot({ signature }: { signature?: string }) {
  if (!signature) return null;
  return (
    <a
      href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
      target="_blank"
      rel="noreferrer"
      className="enter-fade inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground tnum hover:text-foreground"
      title="View transaction on Solana Explorer"
    >
      {shortSig(signature)}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}
