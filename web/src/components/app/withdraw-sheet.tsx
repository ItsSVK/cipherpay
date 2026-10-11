"use client";

import { useState } from "react";
import { ArrowDownToLineIcon, CheckIcon, PackageOpenIcon, InboxIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import type { WithdrawStage } from "@/lib/chain/withdraw-run";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useWithdraw } from "@/components/chain/use-receive";
import { useEmployee } from "@/components/app/employee-context";
import { SolNotice } from "@/components/app/sol-notice";
import { StatusBadge } from "@/components/app/status-badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];

/** One plain sentence per real engine stage, shown under the working step. */
function nowLine(stage: WithdrawStage | null, waiting: boolean): string | null {
  if (waiting) return stage === "apply" ? "Waiting for your wallet to approve applying your pending pay" : "Waiting for your wallet to approve the withdrawal";
  switch (stage) {
    case "apply": return "Applying your pending pay on devnet…";
    case "prove": return "Generating zero-knowledge proofs in this tab…";
    case "create": return "Creating the proof accounts on devnet…";
    case "verify": return "Devnet is verifying both proofs…";
    case "withdraw": return "Confirming the withdrawal on devnet…";
    case "close": return "Closing the proof accounts…";
    default: return null;
  }
}

const BUTTON_STAGE: Record<WithdrawStage, string> = { apply: "Apply pending", prove: "Proving", create: "Proof accounts", verify: "Verify", withdraw: "Withdraw", close: "Wrapping up" };

export function WithdrawSheet() {
  const keys = useKeys();
  const emp = useEmployee();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(25);
  const [unwrap, setUnwrap] = useState(true);

  const live = useWithdraw();
  const [started, setStarted] = useState<{ needsApply: boolean; amount: bigint; remaining: bigint } | null>(null);
  const frozen = started && live.phase !== "error" ? started : null;
  const spendable = emp.available + emp.pending;
  const amount = frozen?.amount ?? (spendable * BigInt(pct)) / 100n;
  const needsApply = frozen?.needsApply ?? emp.pending > 0n;
  const remaining = frozen?.remaining ?? spendable - amount;

  const steps: Step[] = [
    ...(needsApply ? [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" as const, icon: <InboxIcon /> }] : []),
    { label: "Prove you can cover it", detail: "Zero-knowledge proofs built in this tab show the balance covers it, without revealing it.", visibility: "encrypted" as const, icon: <ShieldCheckIcon /> },
    { label: "Withdraw from confidential balance", detail: `${formatUsdc(amount)} USDC leaves the encrypted balance and lands in your wallet, in the clear.`, visibility: "public" as const, icon: <ArrowDownToLineIcon /> },
    ...(unwrap ? [{ label: "Unwrap to plain USDC", detail: "Converts wrapped Token-2022 into standard USDC in the same transaction.", visibility: "public" as const, icon: <PackageOpenIcon /> }] : []),
  ];

  const base = needsApply ? 1 : 0;
  const liveCompleted = live.phase === "done" ? steps.length : live.stage === "withdraw" ? base + 1 : live.stage === "close" ? steps.length : live.stage === "create" || live.stage === "verify" ? base : live.stage === "prove" && live.applied ? base : 0;
  const stepper = { running: live.running, done: live.phase === "done", completed: liveCompleted };
  const failedAt =
    live.phase !== "error" || !live.failedStage
      ? null
      : live.failedStage === "apply" && needsApply
        ? 0
        : live.failedStage === "withdraw" || live.failedStage === "close"
          ? base + 1
          : base;
  const progress: ButtonProgress | null = stepper.done
    ? { label: "Withdrawn", fill: 100, done: true }
    : stepper.running
      ? {
          label: live.waiting
            ? "Approve in your wallet"
            : `Step ${Math.min(liveCompleted + 1, steps.length)} of ${steps.length} · ${live.stage ? BUTTON_STAGE[live.stage] : "Starting"}`,
          fill: Math.max(6, (liveCompleted / steps.length) * 100),
        }
      : null;
  const locked = stepper.running || stepper.done;
  const closeSheet = () => {
    live.reset();
    setStarted(null);
    setOpen(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (stepper.running) return;
        setOpen(o);
        if (!o) {
          setStarted(null);
          if (live.phase !== "idle") live.reset();
        }
      }}
    >
      <SheetTrigger render={<Button className="h-9 gap-1.5 text-xs font-medium" />}>
        <ArrowDownToLineIcon className="size-3.5" /> Withdraw
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Withdraw to Wallet</SheetTitle>
          <SheetDescription>
            Choose how much to withdraw. Partial withdrawal is encouraged to keep the remainder confidential.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-6 pt-2">
          <SolNotice />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label htmlFor="withdraw-slider" className="text-xs font-medium text-foreground">
                  Withdrawal Percentage
                </label>
                <InfoTooltip content="Partial withdrawals keep the remainder hidden from public block explorers." />
              </div>
              <span className="font-mono text-lg font-semibold tnum text-foreground">
                {formatUsdc(amount)} <span className="font-sans text-xs font-normal text-muted-foreground">USDC</span>
              </span>
            </div>

            <Slider
              id="withdraw-slider"
              min={0}
              max={100}
              step={1}
              value={[pct]}
              disabled={locked}
              onValueChange={(v) => setPct(Array.isArray(v) ? v[0] : v)}
              aria-label="Percentage to withdraw"
              className="py-2"
            />

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick percentage presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={locked}
                  onClick={() => setPct(p)}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 disabled:opacity-50",
                    pct === p
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {p === 100 ? "100% (All)" : `${p}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-muted/20 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stays Encrypted</p>
              <p className="mt-1 font-mono text-base font-semibold tnum text-foreground">
                <Cipher
                  value={formatUsdc(remaining)}
                  seed={`wd-remaining-${remaining}`}
                  revealed={keys.ready && emp.balanceStatus === "ready"}
                  suffix="USDC"
                  className="[&>span:last-child]:text-xs"
                />
              </p>
            </div>
            <div className="rounded-xl border border-pending/30 bg-pending-soft/50 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-pending">Becomes Public</p>
              <p className="mt-1 font-mono text-base font-semibold tnum text-foreground" key={amount.toString()}>
                <span className="enter-fade inline-block">{formatUsdc(amount)}</span>{" "}
                <span className="font-sans text-xs font-normal text-muted-foreground">USDC</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3.5">
            <div>
              <p className="text-xs font-medium text-foreground">Automatically unwrap to standard USDC</p>
              <p className="text-[11px] text-muted-foreground">Convert wrapped token into standard USDC in one atomic transaction.</p>
            </div>
            <Switch checked={unwrap} onCheckedChange={setUnwrap} disabled={locked} aria-label="Unwrap to standard USDC" />
          </div>

          <div className="rounded-2xl border border-border/80 p-1.5">
            <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Execution steps</h3>
              <StatusBadge
                tone={stepper.done ? "verified" : failedAt != null ? "failed" : stepper.running ? "key" : "pending"}
                pulse={stepper.running}
                className="text-[10.5px]"
              >
                {stepper.done
                  ? `Revealed ${formatUsdc(amount)} USDC`
                  : failedAt != null
                    ? "Stopped"
                    : stepper.running
                      ? `Step ${Math.min(liveCompleted + 1, steps.length)} of ${steps.length}`
                      : `Reveals ${formatUsdc(amount)} USDC`}
              </StatusBadge>
            </div>
            <StepList
              steps={steps}
              completed={stepper.completed}
              running={stepper.running}
              waiting={live.waiting}
              failedAt={failedAt}
              now={nowLine(live.stage, live.waiting)}
            />
          </div>

          {live.error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {live.error}
              {live.maybeSent ? " The transaction may have completed: check your public balance before resubmitting." : ""}
            </p>
          ) : null}

          {live.phase === "done" ? (
            <p role="status" className="rounded-xl bg-verified-soft p-3 text-xs text-verified">
              Withdrawal confirmed on devnet. Balances updating…
            </p>
          ) : null}

          {live.warning ? (
            <p role="status" className="rounded-xl bg-pending-soft p-3 text-xs text-pending">{live.warning}</p>
          ) : null}

          {!live.canSign ? (
            <p className="text-xs text-muted-foreground">{live.cannotSignReason}</p>
          ) : null}

          <ProgressButton
            progress={progress}
            disabled={amount === 0n || !emp.hasSol || !live.canSign}
            onClick={() => {
              if (!keys.requireKeys()) return;
              setStarted({ needsApply, amount, remaining });
              void live.run(amount, unwrap);
            }}
            className="h-11 w-full text-sm"
            idleClassName="bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
          >
            {live.error ? "Retry withdrawal" : keys.ready ? `Withdraw ${formatUsdc(amount)} USDC` : "Unlock keys to withdraw"}
          </ProgressButton>

          <div
            className={cn("-mt-2 grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo", stepper.done ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
            aria-hidden={!stepper.done}
            inert={!stepper.done}
          >
            <div className="min-h-0 overflow-hidden">
              <Button variant="outline" className="mt-2 h-10 w-full gap-1.5" onClick={closeSheet}>
                <CheckIcon className="size-3.5" strokeWidth={3} /> Done
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-center text-muted-foreground">
            Public wallet balance: <span className="font-mono tnum text-foreground font-medium">{formatUsdc(emp.publicUsdc)} USDC</span>
            {emp.publicWusdc > 0n ? <>, + <span className="font-mono tnum text-foreground font-medium">{formatUsdc(emp.publicWusdc)} WUSDC</span></> : null}.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
