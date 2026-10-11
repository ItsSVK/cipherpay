"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveRestoreIcon, CheckIcon, ChevronDownIcon, ExternalLinkIcon, FilePlus2Icon, FileTextIcon, FingerprintIcon, RadioTowerIcon, RefreshCwIcon, RotateCcwIcon, SendIcon, ShieldCheckIcon, SigmaIcon, WalletIcon, XIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Flow, type FlowStep } from "@/components/crypto/flow";
import { mmss, useOperator } from "@/components/app/operator-context";
import type { RunStatus } from "@/lib/payroll/types";
import type { RecipientRun } from "@/lib/payroll/use-run-simulation";
import { cn } from "@/lib/utils";

/** Where a run is on the page: choosing, checking, waiting for approval, sending, finished. Shared by Run payroll and Split payout. */
export type RunPhase = "review" | "simulating" | "simulated" | "executing" | "done";
export type CheckState = "idle" | "running" | "pass" | "fail";
/** What a failed pre-flight check offers to do about it. */
export type Fix = { kind: "skip"; ids: string[]; label: string } | { kind: "resume" } | { kind: "operator"; label: string };
export interface Check { id: string; label: string; ok: boolean; detail: string; fix?: Fix; state: CheckState }

/** The five steps of one payment, as the engine reports them (PIPELINE_STAGES order). Labels are short so five fit a phone. */
export const STAGE_LABEL = ["Prove", "Accounts", "Verify", "Transfer", "Close"] as const;
const STAGE_ICON = [<SigmaIcon key="p" />, <FilePlus2Icon key="c" />, <ShieldCheckIcon key="v" />, <SendIcon key="t" />, <ArchiveRestoreIcon key="x" />];
export const STAGE_DETAIL = [
  "Building the equality, validity and range proofs in this tab.",
  "Creating the three temporary proof accounts.",
  "The ZK ElGamal program is verifying the proofs on-chain.",
  "Sending the encrypted transfer from the treasury.",
  "Closing the proof accounts. Their rent comes back.",
];

/** One recipient's run state as flow steps: finished ones done, the current one working (or waiting on the wallet), a failure marked where it stopped. */
export function laneSteps(r: RecipientRun | undefined): FlowStep[] {
  const completed = r?.completed ?? 0;
  return STAGE_LABEL.map((label, i) => ({
    key: label,
    label,
    icon: STAGE_ICON[i],
    state:
      r?.status === "done" || i < completed
        ? "done"
        : i === completed && r?.status === "failed"
          ? "error"
          : i === completed && r?.status === "running"
            ? r.deadline
              ? "waiting"
              : "active"
            : "idle",
  }));
}

/** The status line under a recipient's amount while a run is going. */
export function laneStatus(r: RecipientRun | undefined): { text: string; className: string } {
  if (r?.status === "done") return { text: "Confirmed", className: "text-verified" };
  if (r?.status === "failed") return { text: "Failed", className: "text-destructive" };
  if (r?.status === "running") return { text: r.deadline ? "Awaiting signature" : STAGE_LABEL[Math.min(r.completed, STAGE_LABEL.length - 1)], className: "text-primary" };
  return { text: r?.waiting ? "Waiting" : "Queued", className: "text-muted-foreground" };
}

/** The sentence under a working (or stopped) lane's flow. */
export function laneDetail(r: RecipientRun | undefined): string {
  if (r?.status === "failed") return r.error ?? "This payment did not complete.";
  if (r?.deadline) return "Waiting for your wallet to approve the transfer.";
  if (r?.waiting) return "Waits for the previous transfer to land. Transfers from one treasury go one at a time.";
  return STAGE_DETAIL[Math.min(r?.completed ?? 0, STAGE_DETAIL.length - 1)];
}

/** The run's lifecycle states, for PhaseRail. A halted run swaps the last two for "Needs attention". */
const BASE_FLOW: { id: RunStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "approved", label: "Approved" },
  { id: "executing", label: "Executing" },
  { id: "done", label: "Done" },
];
export function runFlow(status: RunStatus) {
  return status === "failed" ? [...BASE_FLOW.slice(0, 3), { id: "failed" as RunStatus, label: "Needs attention" }] : BASE_FLOW;
}

/** The run's lifecycle status and its badge, from the page phase. */
export function runStatus(phase: RunPhase, halted: boolean, allPass: boolean, failedChecks: number) {
  const status: RunStatus = halted ? "failed" : phase === "review" || phase === "simulating" ? "draft" : phase === "simulated" ? "pending_approval" : phase === "executing" ? "executing" : "done";
  const tone = status === "failed" ? "failed" : status === "done" ? "verified" : status === "executing" ? "key" : status === "pending_approval" ? (allPass ? "verified" : "pending") : "neutral";
  const label = status === "failed" ? "Needs attention" : status === "done" ? "Completed" : status === "executing" ? "Executing" : status === "pending_approval" ? (allPass ? "Ready to approve" : `${failedChecks} to resolve`) : phase === "simulating" ? "Checking" : "Draft";
  return { status, tone: tone as "failed" | "verified" | "key" | "pending" | "neutral", label };
}

/**
 * Ticks a list of checks through running -> pass/fail, one after another, so the admin can follow them. The results are already
 * known (they are read from chain state); the pacing is only there to make each one readable.
 */
export function usePreflight() {
  const [checks, setChecks] = useState<Check[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const run = useCallback(
    (results: Omit<Check, "state">[], onDone: () => void) => {
      clear();
      setChecks(results.map((r) => ({ ...r, state: "idle" })));
      results.forEach((r, i) => {
        timers.current.push(setTimeout(() => setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: "running" } : x))), i * 500));
        timers.current.push(
          setTimeout(() => {
            setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: r.ok ? "pass" : "fail" } : x)));
            if (i === results.length - 1) onDone();
          }, i * 500 + 440),
        );
      });
    },
    [clear],
  );

  const reset = useCallback(() => {
    clear();
    setChecks([]);
  }, [clear]);

  const done = checks.filter((c) => c.state === "pass" || c.state === "fail").length;
  const failed = checks.filter((c) => c.state === "fail").length;
  const allPass = checks.length > 0 && checks.every((c) => c.state === "pass");
  return { checks, run, reset, done, failed, allPass };
}

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

/** The lane's leading mark during a run: queued ring, running pulse, confirmed check, failed cross. */
export function LaneMark({ status }: { status: RecipientRun["status"] }) {
  return (
    <span className="relative shrink-0" aria-hidden>
      {status === "running" ? <span className="absolute -inset-1 rounded-full border-2 border-dashed border-primary/40 animate-[spin_6s_linear_infinite]" /> : null}
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color] duration-500 ease-out-expo",
          status === "done" && "border-verified bg-verified text-white",
          status === "failed" && "border-destructive bg-destructive text-white",
          status === "running" && "border-primary/50 bg-primary/10",
          status === "pending" && "border-input bg-card",
        )}
      >
        {status === "done" ? (
          <CheckIcon className="size-3.5 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
        ) : status === "failed" ? (
          <XIcon className="size-3.5" strokeWidth={3} />
        ) : status === "running" ? (
          <span className="size-2 rounded-full bg-primary [animation:dot-pulse_900ms_ease-in-out_infinite]" />
        ) : null}
      </span>
    </span>
  );
}

/** A halted run: what happened and the one way on. Confirmed payments are never re-sent. */
export function RetryFailedAlert({ count, onRetry }: { count: number; onRetry: () => void }) {
  return (
    <div className="enter-fade mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-failed-soft px-4 py-3 sm:mx-6" role="alert">
      <p className="text-xs text-destructive">
        {count} payment{count === 1 ? "" : "s"} did not complete. Confirmed payments stay paid and are never sent twice.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} className="h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10">
        <RefreshCwIcon className="mr-1 size-3" /> Retry failed
      </Button>
    </div>
  );
}

/** The Run control header's "Start over" pill. Only offered while nothing has been paid. */
export function StartOverButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="enter-fade ml-auto h-7 gap-1.5 rounded-full border border-primary/20 bg-accent/70 px-3 text-[11px] font-semibold text-accent-foreground shadow-2xs hover:border-primary/35 hover:bg-accent hover:text-accent-foreground [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:-rotate-90"
      onClick={onClick}
    >
      <RotateCcwIcon className="size-3.5" /> Start over
    </Button>
  );
}

/** How this run will be signed: by the payroll helper (automatic, with its live countdown) or by the wallet, once per payment. */
export function SigningCard({ payments, locked }: { payments: number; locked: boolean }) {
  const { live, secondsLeft, status, setModalOpen } = useOperator();
  const low = live && secondsLeft <= 10;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-xs transition-colors duration-300",
        !live || low ? "border-pending/30 bg-pending-soft" : "border-verified/25 bg-verified-soft",
      )}
    >
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg shadow-2xs", live ? (low ? "bg-pending text-white" : "bg-verified text-white") : "bg-card text-pending")}>
        {live ? <ZapIcon className="size-4 fill-current" /> : <WalletIcon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          {live ? "Automatic" : "Manual approvals"}
          {live ? (
            <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-semibold tnum", low ? "text-pending" : "text-verified")} role="timer" aria-label="Automatic payroll time left">
              <span aria-hidden className="size-1.5 rounded-full bg-current [animation:dot-pulse_1.2s_ease-in-out_infinite]" />
              {mmss(secondsLeft)}
            </span>
          ) : null}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {live ? `Helper signs · ${status?.paymentsLeft ?? 0} payment${status?.paymentsLeft === 1 ? "" : "s"} left` : `Your wallet approves each of ${payments} payment${payments === 1 ? "" : "s"}.`}
        </p>
      </div>
      <Button variant="outline" size="sm" className="h-7 shrink-0 bg-card text-[11px]" onClick={() => setModalOpen(true)} disabled={locked}>
        {live ? "Manage" : "Turn on"}
      </Button>
    </div>
  );
}

/**
 * Pre-flight checks, inside the batch, as one collapsible panel. They open and tick through while checking. When every check
 * passes they stay open to be read, then fold to their header once the admin moves on (any click outside the panel, or
 * Approve). A failure keeps them open and cannot be folded. Re-running opens them again. The header can always reopen them.
 */
export function PreflightBand({ checks, phase, allPass, onFix }: { checks: Check[]; phase: RunPhase; allPass: boolean; onFix: (f: Fix) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // What the admin chose with the header (or by clicking away); null = the phase's default. Reset whenever the phase changes.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [lastPhase, setLastPhase] = useState(phase);
  if (lastPhase !== phase) {
    setLastPhase(phase);
    setUserOpen(null);
  }

  const visible = phase !== "review" && checks.length > 0;
  const checking = phase === "simulating";
  const failed = checks.filter((c) => c.state === "fail").length;
  const passed = checks.filter((c) => c.state === "pass").length;
  const pinned = checking || (phase === "simulated" && !allPass);
  const open = pinned || (userOpen ?? phase === "simulated");

  // All green and still open: fold as soon as the admin clicks anywhere else (the Approve button included).
  const foldOnLeave = phase === "simulated" && allPass && open;
  useEffect(() => {
    if (!foldOnLeave) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [foldOnLeave]);

  const summary = checking
    ? `Checking ${Math.min(passed + failed + 1, checks.length)} of ${checks.length}…`
    : failed > 0
      ? `${failed} of ${checks.length} need${failed === 1 ? "s" : ""} attention`
      : allPass
        ? `All ${checks.length} checks passed`
        : "Checks done";

  return (
    <Reveal open={visible}>
      <div ref={ref} className="px-5 pt-4 sm:px-6">
        <div
          className={cn(
            "rounded-2xl border transition-colors duration-300",
            failed > 0 && !checking ? "border-destructive/25 bg-failed-soft/30" : allPass && !open ? "border-verified/25 bg-verified-soft/60" : "border-border/80 bg-muted/20",
          )}
        >
          <button
            type="button"
            onClick={() => !pinned && setUserOpen(!open)}
            aria-expanded={open}
            aria-controls="preflight-list"
            aria-disabled={pinned}
            className={cn("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", pinned ? "cursor-default" : "cursor-pointer")}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-white transition-colors duration-300",
                checking ? "bg-primary" : failed > 0 ? "bg-destructive" : "bg-verified",
              )}
            >
              {checking ? (
                <span className="size-1.5 rounded-full bg-white [animation:dot-pulse_700ms_ease-in-out_infinite]" />
              ) : failed > 0 ? (
                <XIcon className="size-3" strokeWidth={3} />
              ) : (
                <CheckIcon className="size-3 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Pre-flight checks</p>
              <p className={cn("text-xs font-medium", checking ? "text-foreground" : failed > 0 ? "text-destructive" : "text-verified")}>{summary}</p>
            </div>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Read from devnet, nothing is sent</span>
            {!pinned ? <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} /> : null}
          </button>

          <Reveal open={open}>
            <ul id="preflight-list" className="grid gap-1.5 px-4 pb-4">
              {checks.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2 transition-[background-color,opacity] duration-300",
                    c.state === "fail" && "bg-failed-soft/70",
                    c.state === "running" && "bg-accent/40",
                    c.state === "idle" && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-white transition-colors duration-300",
                      c.state === "pass" ? "bg-verified" : c.state === "fail" ? "bg-destructive" : c.state === "running" ? "bg-primary" : "bg-muted",
                    )}
                  >
                    {c.state === "pass" ? (
                      <CheckIcon className="size-3 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
                    ) : c.state === "fail" ? (
                      <XIcon className="size-3" strokeWidth={3} />
                    ) : c.state === "running" ? (
                      <span className="size-1.5 rounded-full bg-white [animation:dot-pulse_700ms_ease-in-out_infinite]" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground">{c.state === "idle" ? "Waiting" : c.state === "running" ? "Checking…" : c.detail}</p>
                  </div>
                  {c.state === "fail" && c.fix ? (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => onFix(c.fix!)}>
                      {c.fix.kind === "resume" ? "Resume vault" : c.fix.label}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </Reveal>
  );
}
