"use client";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ProgressButton } from "@/components/app/progress-button";
import { useLiveGuard } from "@/components/app/live-guard";
import { useVault } from "@/components/app/vault-context";
import { onWalletPromptChange } from "@/lib/chain/send";
import { cn } from "@/lib/utils";

/** Where a pause / resume is, from the click on Confirm until the vault state on screen matches. */
type Phase = "idle" | "preparing" | "wallet" | "confirming" | "syncing" | "done";

/** Button label, line under the title, and how far the button's fill has got, per phase. */
const PROGRESS: Record<Exclude<Phase, "idle">, { label: string; hint: string; fill: number }> = {
  preparing: { label: "Preparing…", hint: "Building the transaction.", fill: 12 },
  wallet: { label: "Approve in wallet", hint: "Approve the transaction in your wallet popup.", fill: 35 },
  confirming: { label: "Confirming…", hint: "Waiting for devnet to confirm it.", fill: 70 },
  syncing: { label: "Confirming…", hint: "Waiting for devnet to confirm it.", fill: 88 },
  done: { label: "", hint: "Updated on-chain.", fill: 100 },
};

/** How long to wait for the chain poll to reflect a confirmed change before calling it done anyway. */
const SYNC_TIMEOUT_MS = 6000;
const DONE_HOLD_MS = 1600;

/**
 * Payroll on/off: the vault's current state and ONE action button. While a pause / resume is in flight the button
 * itself becomes the progress indicator (fill + label per step), so nothing around it moves.
 */
export function DispatchControl() {
  const v = useVault();
  const guard = useLiveGuard();
  const paused = v.vault.paused;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(false);
  const [rawPhase, setPhase] = useState<Phase>("idle");
  // A confirmed change shows up on the next chain poll; once the vault on screen matches, it is done.
  const phase: Phase = rawPhase === "syncing" && paused === target ? "done" : rawPhase;
  const running = phase !== "idle";
  const runningRef = useRef(false);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // The wallet popup opening and closing is the only signal we get between "sent to wallet" and "sent to network".
  useEffect(
    () =>
      onWalletPromptChange((open) => {
        if (!runningRef.current) return;
        setPhase((p) => (open ? "wallet" : p === "wallet" ? "confirming" : p));
      }),
    [],
  );

  // If the poll is slow to reflect a confirmed change, stop waiting for it.
  useEffect(() => {
    if (phase !== "syncing") return;
    const t = setTimeout(() => setPhase("done"), SYNC_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), DONE_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Errors go to a toast, not inline, so a failure doesn't push the card around either.
  useEffect(() => {
    if (v.pauseError) toast.error("Payroll status not changed", { description: v.pauseError });
  }, [v.pauseError]);

  const apply = async () => {
    if (!v.isLive && !guard()) return;
    setPhase("preparing");
    runningRef.current = true;
    const ok = await v.setPaused(target);
    setPhase(ok ? "syncing" : "idle");
  };

  // What the card shows: the state being moved TO while running, the current one otherwise.
  const showPaused = running ? target : paused;
  const progress = running ? PROGRESS[phase as Exclude<Phase, "idle">] : null;
  const done = phase === "done";

  return (
    <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Dispatch Governance</span>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <StatusOrb paused={showPaused} busy={running && !done} />

        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-foreground">
            {running && !done
              ? target
                ? "Pausing payroll…"
                : "Resuming payroll…"
              : showPaused
                ? "Payroll is paused"
                : "Payroll is live"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {progress ? progress.hint : paused ? "New payouts are blocked." : "New payouts can be sent."}
          </p>
        </div>

        <ProgressButton
          progress={progress ? { label: done ? (target ? "Paused" : "Resumed") : progress.label, fill: progress.fill, done } : null}
          disabled={v.pauseBusy}
          onClick={() => {
            setTarget(!paused);
            setConfirmOpen(true);
          }}
          className="h-10 w-44 shrink-0 text-xs"
          idleClassName={
            paused
              ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
              : "border border-pending/40 bg-pending-soft text-pending shadow-2xs hover:border-pending/60 hover:bg-pending/10"
          }
        >
          {paused ? (
            <>
              <PlayIcon className="size-3.5 fill-current" /> Resume payroll
            </>
          ) : (
            <>
              <PauseIcon className="size-3.5 fill-current" /> Pause payroll
            </>
          )}
        </ProgressButton>
      </div>

      <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        Employee withdrawals stay open either way.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? "Pause payroll?" : "Resume payroll?"}
        description={
          target
            ? "New payroll payments will be rejected until you resume. Employees can still withdraw what they have been paid."
            : "Payroll payments can be sent again."
        }
        confirmLabel={target ? "Pause payroll" : "Resume payroll"}
        variant={target ? "destructive" : "default"}
        // Close the dialog straight away; progress is shown on the button, not in a blocking modal.
        onConfirm={() => void apply()}
      />
    </div>
  );
}

/** Live: green core with a slow ripple. Paused: amber with a pause glyph. Busy: a spinning ring around either. */
function StatusOrb({ paused, busy }: { paused: boolean; busy: boolean }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden>
      {busy ? (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
      ) : !paused ? (
        <span className="absolute inset-1 rounded-full bg-verified/25 [animation:orb-ripple_2.4s_ease-out_infinite]" />
      ) : null}
      <span
        className={cn(
          "relative grid size-8 place-items-center rounded-full transition-colors duration-300",
          paused ? "bg-pending-soft text-pending ring-1 ring-pending/30" : "bg-verified/12 text-verified ring-1 ring-verified/30",
        )}
      >
        {paused ? <PauseIcon className="size-3.5 fill-current" /> : <span className="size-2.5 rounded-full bg-verified" />}
      </span>
    </span>
  );
}
