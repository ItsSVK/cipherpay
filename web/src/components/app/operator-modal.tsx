"use client";

import { KeyIcon, MinusIcon, PlusIcon, PowerIcon, ZapIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/app/segmented";
import { WalletCountdown } from "@/components/app/wallet-countdown";
import { StatusBadge } from "@/components/app/status-badge";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import { Reveal } from "@/components/app/run-payroll-parts";
import { OPERATOR_TTL_OPTIONS } from "@/lib/chain/operator";
import { useOperator, sol, mmss } from "@/components/app/operator-context";
import { cn } from "@/lib/utils";

const MAX_CAP = 500;

export function OperatorModal() {
  const { modalOpen, setModalOpen, settings, setSettings, status, balance, secondsLeft, live, busy, wallet, onSwitch, reclaim, ready } = useOperator();

  const editable = !live && !busy;
  const shown = ready ? status : null;
  const cap = settings.maxPayments ?? 10;
  const setCap = (n: number) => setSettings({ ...settings, maxPayments: Math.max(1, Math.min(MAX_CAP, Math.floor(n) || 1)) });
  const leftover = !live && balance !== null && balance > 10_000n;

  // The button follows the real step: a SOL top-up (the one time-limited transaction) carries a deadline, the
  // authorization and the revoke are signed messages.
  const progress: ButtonProgress | null =
    busy === "authorizing"
      ? { label: wallet?.deadline ? "Approve SOL top-up in wallet" : "Approve authorization in wallet", fill: wallet?.deadline ? 35 : 70 }
      : busy === "revoking"
        ? { label: wallet ? "Approve revoke in wallet" : "Returning SOL…", fill: wallet ? 40 : 80 }
        : null;

  const badge = live ? (
    <StatusBadge tone="verified" pulse>On</StatusBadge>
  ) : busy === "authorizing" ? (
    <StatusBadge tone="key" pulse>Authorizing</StatusBadge>
  ) : busy === "revoking" ? (
    <StatusBadge tone="key" pulse>Turning off</StatusBadge>
  ) : (
    <StatusBadge>Off</StatusBadge>
  );

  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {/* Header */}
        <div className="border-b border-border/60 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 pr-8">
            <div className={cn("grid size-8 shrink-0 place-items-center rounded-xl shadow-2xs transition-colors duration-300", live ? "bg-verified text-white" : "bg-primary/10 text-primary")}>
              <ZapIcon className={cn("size-4", live && "fill-current")} />
            </div>
            <DialogTitle className="font-serif font-normal tracking-[-0.015em] text-xl">Automatic payroll</DialogTitle>
            {badge}
          </div>
          <DialogDescription className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Approve once and your payroll helper signs each payment for you, with no wallet popup per person. It can only pay, and only within the limits below.
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="grid gap-5 px-6 py-5">
          {live && shown ? (
            <div
              className={cn(
                "enter-fade grid grid-cols-2 divide-x rounded-2xl border transition-colors duration-300",
                secondsLeft <= 10 ? "divide-pending/20 border-pending/30 bg-pending-soft" : "divide-verified/20 border-verified/25 bg-verified-soft",
              )}
              role="status"
            >
              <div className="p-4">
                <p className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", secondsLeft <= 10 ? "text-pending" : "text-verified")}>
                  <span aria-hidden className="size-1.5 rounded-full bg-current [animation:dot-pulse_1.2s_ease-in-out_infinite]" />
                  Time left
                </p>
                <p className={cn("mt-1 font-mono text-3xl font-bold tracking-tight tnum", secondsLeft <= 10 ? "text-pending" : "text-foreground")}>{mmss(secondsLeft)}</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-verified">Payments left</p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-tight tnum text-foreground">{shown.paymentsLeft}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <p className="text-xs font-semibold text-foreground">Stays on for</p>
                <Segmented
                  label="How long automatic payroll stays on"
                  value={String(settings.ttlSeconds)}
                  onChange={(v) => editable && setSettings({ ...settings, ttlSeconds: Number(v) })}
                  options={OPERATOR_TTL_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))}
                  className={cn(!editable && "pointer-events-none opacity-60")}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <label htmlFor="max-payments-modal" className="text-xs font-semibold text-foreground">Payment limit</label>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Amounts are encrypted, so the cap is a count, not a value.</p>
                </div>
                <div className={cn("flex h-9 shrink-0 items-center rounded-lg border border-input bg-card", !editable && "opacity-60")}>
                  <button type="button" aria-label="Fewer payments" disabled={!editable || cap <= 1} onClick={() => setCap(cap - 1)} className="grid size-9 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                    <MinusIcon className="size-3.5" />
                  </button>
                  <input
                    id="max-payments-modal"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_CAP}
                    value={cap}
                    disabled={!editable}
                    onChange={(e) => setCap(Number(e.target.value))}
                    className="h-full w-12 bg-transparent text-center font-mono text-sm font-semibold tnum outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button type="button" aria-label="More payments" disabled={!editable || cap >= MAX_CAP} onClick={() => setCap(cap + 1)} className="grid size-9 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                    <PlusIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

          <Reveal open={!!wallet}>
            {wallet ? (
              <div className="rounded-xl bg-accent/50 px-3.5 py-3">
                {wallet.deadline ? <WalletCountdown deadline={wallet.deadline} note={wallet.note} /> : <p className="text-xs font-medium leading-relaxed text-accent-foreground" role="status">{wallet.note}</p>}
              </div>
            ) : null}
          </Reveal>
        </div>

        {/* Footer */}
        <div className="grid gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
          {!ready ? (
            <ProgressButton progress={null} disabled className="h-11 w-full text-sm" idleClassName="bg-primary text-primary-foreground shadow-xs">
              <KeyIcon className="size-4" /> Unlock keys to turn on
            </ProgressButton>
          ) : live || busy === "revoking" ? (
            <ProgressButton progress={progress} onClick={() => onSwitch(false)} className="h-11 w-full text-sm" idleClassName="border border-destructive/30 bg-failed-soft text-destructive shadow-xs hover:bg-destructive/10">
              <PowerIcon className="size-4" /> Turn off & return SOL
            </ProgressButton>
          ) : (
            <ProgressButton progress={progress} onClick={() => onSwitch(true)} className="h-11 w-full text-sm" idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90">
              <ZapIcon className="size-4" /> Turn on for {OPERATOR_TTL_OPTIONS.find((o) => o.seconds === settings.ttlSeconds)?.label ?? "a while"}
            </ProgressButton>
          )}

          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[11px] text-muted-foreground">
            {live ? (
              <>Helper holds <span className="font-mono tnum text-foreground">{balance === null ? "…" : sol(balance)}</span> SOL for proof-account rent.</>
            ) : leftover ? (
              <>
                Helper still holds <span className="font-mono tnum text-foreground">{sol(balance)}</span> SOL.
                <button type="button" onClick={reclaim} disabled={!!busy} className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50">
                  Reclaim
                </button>
              </>
            ) : (
              <>You sign a message, not a transaction, so a slow wallet can&apos;t make it expire.</>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
