"use client";

import { useState } from "react";
import { ArrowDownToLineIcon } from "lucide-react";
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
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];

/** Partial withdrawal is the default path: a slider that starts at 25%, never "all". */
export function WithdrawSheet() {
  const keys = useKeys();
  const emp = useEmployee();
  const guard = useLiveGuard();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(25);
  const [unwrap, setUnwrap] = useState(true);

  // Once a withdrawal starts, freeze what it was started with: the chain poll refreshes balances while it runs (applying pending pay and
  // then withdrawing both change them), and the step list and amount must not shift under the user mid-run.
  const live = useWithdraw();
  const [started, setStarted] = useState<{ needsApply: boolean; amount: bigint; remaining: bigint } | null>(null);
  // A failed attempt unfreezes, so the person can change the amount and try again.
  const frozen = started && !(emp.isLive && live.phase === "error") ? started : null;
  const spendable = emp.available + emp.pending;
  const amount = frozen?.amount ?? (spendable * BigInt(pct)) / 100n;
  const needsApply = frozen?.needsApply ?? emp.pending > 0n;
  const remaining = frozen?.remaining ?? spendable - amount;

  const steps: Step[] = [
    ...(needsApply ? [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" as const }] : []),
    { label: "Prove you can cover it", detail: "Two proofs are built in your browser (the balance matches, the amount is in range) and stored in short-lived accounts.", visibility: "encrypted" as const },
    { label: "Withdraw from your confidential balance", detail: `${formatUsdc(amount)} USDC leaves the encrypted balance and becomes visible on-chain.`, visibility: "public" as const },
    ...(unwrap ? [{ label: "Unwrap to USDC", detail: emp.isLive ? "In the same approval as the withdrawal: converts the wrapped token back to plain USDC in your wallet." : "Converts the wrapped token back to plain USDC in your wallet.", visibility: "public" as const }] : []),
  ];

  const demo = useStepper(steps.length, 1000, () => {
    if (needsApply) emp.applyPending();
    emp.withdraw(amount, unwrap);
    toast.success(`${formatUsdc(amount)} ${unwrap ? "USDC" : "WUSDC"} withdrawn`, { description: "The rest of your balance stays encrypted." });
  });
  // Real wallets: the stages of lib/chain/withdraw-run.ts mapped onto the steps above. The proof accounts are part of "Prove".
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
    <Sheet open={open} onOpenChange={(o) => { if (stepper.running) return; setOpen(o); if (!o) { setStarted(null); if (emp.isLive && live.phase !== "idle") live.reset(); } }}>
      <SheetTrigger render={<Button className="gap-1.5" />}>
        <ArrowDownToLineIcon /> Withdraw
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Withdraw</SheetTitle>
          <SheetDescription>Choose how much to reveal. Most people withdraw a part and leave the rest encrypted.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          <SolNotice />
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="withdraw-slider" className="text-sm font-medium">Amount to withdraw</label>
              <span className="font-mono text-xl font-medium tnum">{formatUsdc(amount)} <span className="font-sans text-sm text-muted-foreground">USDC</span></span>
            </div>
            <Slider id="withdraw-slider" className="mt-4" min={0} max={100} step={1} value={[pct]} disabled={locked} onValueChange={(v) => setPct(Array.isArray(v) ? v[0] : v)} aria-label="Percent of balance to withdraw" />
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              {PRESETS.map((p) => (
                <button key={p} type="button" disabled={locked} onClick={() => setPct(p)} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-out-expo active:scale-95 disabled:opacity-50", pct === p ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                  {p === 100 ? "All" : `${p}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-cipher/60 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Stays encrypted</p>
              <p className="mt-1.5 text-lg font-medium"><Cipher value={formatUsdc(remaining)} seed={`wd-remaining-${remaining}`} revealed={keys.ready && emp.balanceStatus === "ready"} suffix="USDC" className="[&>span:last-child]:text-xs" /></p>
            </div>
            <div className="rounded-lg border border-pending/30 bg-pending-soft p-3.5">
              <p className="text-xs font-medium text-pending">Becomes public</p>
              <p className="mt-1.5 font-mono text-lg font-medium tnum" key={amount.toString()}><span className="enter-fade inline-block">{formatUsdc(amount)}</span> <span className="font-sans text-xs text-muted-foreground">USDC</span></p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
            <div>
              <p className="text-sm font-medium">Also unwrap to USDC</p>
              <p className="text-[13px] text-muted-foreground">Turn the wrapped token into plain USDC in one go.</p>
            </div>
            <Switch checked={unwrap} onCheckedChange={setUnwrap} disabled={locked} aria-label="Also unwrap to USDC" />
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="font-sans text-sm font-semibold tracking-normal">What will happen</h3>
              <StatusBadge tone="pending">Reveals {formatUsdc(amount)}</StatusBadge>
            </div>
            <StepList steps={steps} completed={stepper.completed} running={stepper.running} />
          </div>

          {emp.isLive && live.error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">
              {live.error}
              {live.maybeSent ? " The withdrawal may have gone through: check your balance before trying again so you don't send it twice." : ""}
            </p>
          ) : null}
          {emp.isLive && live.phase === "done" ? <p role="status" className="rounded-lg bg-verified-soft px-3 py-2 text-[13px] text-verified">Confirmed on devnet. Your balances update in a moment.</p> : null}
          {emp.isLive && live.warning ? <p role="status" className="rounded-lg bg-pending-soft px-3 py-2 text-[13px] text-pending">{live.warning}</p> : null}
          {emp.isLive && !live.canSign ? <p className="text-[13px] text-muted-foreground">{live.cannotSignReason}</p> : null}

          {stepper.done ? (
            <Button variant="outline" className="h-10" onClick={closeSheet}>Done</Button>
          ) : (
            <Button
              className="h-10"
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
              {stepper.running ? "Working…" : emp.isLive && live.error ? "Try again" : keys.ready ? `Withdraw ${formatUsdc(amount)} USDC` : "Unlock keys to withdraw"}
            </Button>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Public wallet balance: <span className="font-mono tnum text-foreground">{formatUsdc(emp.publicUsdc)} USDC</span>
            {emp.publicWusdc > 0n ? <>, plus <span className="font-mono tnum text-foreground">{formatUsdc(emp.publicWusdc)} WUSDC</span> not yet unwrapped</> : null}. Withdrawals can be as small or as late as you like.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
