"use client";

import { useState } from "react";
import { ArrowDownToLineIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useWithdraw } from "@/components/chain/use-receive";
import { useEmployee } from "@/components/app/employee-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { SolNotice } from "@/components/app/sol-notice";
import { StatusBadge } from "@/components/app/status-badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];

export function WithdrawSheet() {
  const keys = useKeys();
  const emp = useEmployee();
  const guard = useLiveGuard();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(25);
  const [unwrap, setUnwrap] = useState(true);

  const live = useWithdraw();
  const [started, setStarted] = useState<{ needsApply: boolean; amount: bigint; remaining: bigint } | null>(null);
  const frozen = started && !(emp.isLive && live.phase === "error") ? started : null;
  const spendable = emp.available + emp.pending;
  const amount = frozen?.amount ?? (spendable * BigInt(pct)) / 100n;
  const needsApply = frozen?.needsApply ?? emp.pending > 0n;
  const remaining = frozen?.remaining ?? spendable - amount;

  const steps: Step[] = [
    ...(needsApply ? [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" as const }] : []),
    { label: "Prove you can cover it", detail: "Zero-knowledge proofs generated client-side verify balance validity without revealing plaintext.", visibility: "encrypted" as const },
    { label: "Withdraw from confidential balance", detail: `${formatUsdc(amount)} USDC is decrypted on-chain to your wallet.`, visibility: "public" as const },
    ...(unwrap ? [{ label: "Unwrap to plain USDC", detail: "Converts wrapped Token-2022 into standard USDC in the same transaction.", visibility: "public" as const }] : []),
  ];

  const demo = useStepper(steps.length, 1000, () => {
    if (needsApply) emp.applyPending();
    emp.withdraw(amount, unwrap);
    toast.success(`${formatUsdc(amount)} ${unwrap ? "USDC" : "WUSDC"} withdrawn`, { description: "The remaining balance stays fully encrypted." });
  });

  const base = needsApply ? 1 : 0;
  const liveCompleted = live.phase === "done" ? steps.length : live.stage === "withdraw" ? base + 1 : live.stage === "close" ? steps.length : live.stage === "create" || live.stage === "verify" ? base : live.stage === "prove" && live.applied ? base : 0;
  const stepper = emp.isLive ? { running: live.running, done: live.phase === "done", completed: liveCompleted } : demo;
  const locked = stepper.running || stepper.done;
  const closeSheet = () => {
    if (emp.isLive) live.reset();
    else demo.reset();
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
          if (emp.isLive && live.phase !== "idle") live.reset();
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

          <div className="rounded-xl border bg-muted/20 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Steps</h3>
              <StatusBadge tone="pending" className="text-[10.5px]">Reveals {formatUsdc(amount)} USDC</StatusBadge>
            </div>
            <StepList steps={steps} completed={stepper.completed} running={stepper.running} />
          </div>

          {emp.isLive && live.error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {live.error}
              {live.maybeSent ? " The transaction may have completed: check your public balance before resubmitting." : ""}
            </p>
          ) : null}

          {emp.isLive && live.phase === "done" ? (
            <p role="status" className="rounded-xl bg-verified-soft p-3 text-xs text-verified">
              Withdrawal confirmed on devnet. Balances updating…
            </p>
          ) : null}

          {emp.isLive && live.warning ? (
            <p role="status" className="rounded-xl bg-pending-soft p-3 text-xs text-pending">{live.warning}</p>
          ) : null}

          {emp.isLive && !live.canSign ? (
            <p className="text-xs text-muted-foreground">{live.cannotSignReason}</p>
          ) : null}

          {stepper.done ? (
            <Button variant="outline" className="h-10 w-full" onClick={closeSheet}>Done</Button>
          ) : (
            <Button
              className="h-11 w-full text-sm font-medium"
              disabled={amount === 0n || stepper.running || !emp.hasSol || (emp.isLive && !live.canSign)}
              onClick={() => {
                if (!keys.requireKeys()) return;
                setStarted({ needsApply, amount, remaining });
                if (emp.isLive) {
                  void live.run(amount, unwrap);
                  return;
                }
                if (!guard()) return;
                demo.run();
              }}
            >
              {stepper.running ? "Processing Withdrawal…" : emp.isLive && live.error ? "Retry Withdrawal" : keys.ready ? `Withdraw ${formatUsdc(amount)} USDC` : "Unlock Keys to Withdraw"}
            </Button>
          )}

          <p className="text-[11px] text-center text-muted-foreground">
            Public wallet balance: <span className="font-mono tnum text-foreground font-medium">{formatUsdc(emp.publicUsdc)} USDC</span>
            {emp.publicWusdc > 0n ? <>, + <span className="font-mono tnum text-foreground font-medium">{formatUsdc(emp.publicWusdc)} WUSDC</span></> : null}.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
