"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useEmployee } from "@/components/app/employee-context";
import { SolNotice } from "@/components/app/sol-notice";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [10, 25, 50, 100];

export default function WithdrawPage() {
  const keys = useKeys();
  const emp = useEmployee();
  const [pct, setPct] = useState(25);
  const [unwrap, setUnwrap] = useState(true);

  const needsApply = emp.pending > 0n;
  const spendable = emp.available + emp.pending;
  const amount = (spendable * BigInt(pct)) / 100n;

  const steps: Step[] = [
    ...(needsApply ? [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" as const }] : []),
    { label: "Prove you can cover it", detail: "Two proofs are built in your browser (the balance matches, the amount is in range) and stored in short-lived accounts.", visibility: "encrypted" as const },
    { label: "Withdraw from your confidential balance", detail: `${formatUsdc(amount)} USDC leaves the encrypted balance and becomes visible on-chain.`, visibility: "public" as const },
    ...(unwrap ? [{ label: "Unwrap to USDC", detail: "Converts the wrapped token back to plain USDC in your wallet.", visibility: "public" as const }] : []),
  ];

  const stepper = useStepper(steps.length, 1000, () => {
    if (needsApply) emp.applyPending();
    emp.withdraw(amount, unwrap);
    toast.success(`${formatUsdc(amount)} ${unwrap ? "USDC" : "WUSDC"} withdrawn`, { description: "The rest of your balance stays encrypted." });
  });

  if (!emp.activated) {
    return (
      <>
        <PageHeader title="Withdraw" />
        <section className="plate enter mx-auto max-w-xl p-8 text-center">
          <p className="text-[15px] font-medium">Activate your account first.</p>
          <p className="mt-1 text-sm text-muted-foreground">You need a confidential account before you can hold or withdraw pay.</p>
          <Link href="/employee" className={cn(buttonVariants(), "mt-5 h-10 px-5")}>Go to activation</Link>
        </section>
      </>
    );
  }

  const remaining = spendable - amount;
  const locked = stepper.running || stepper.done;

  return (
    <>
      <PageHeader title="Withdraw" description="Choose how much to reveal. Most people withdraw a part and leave the rest encrypted." />
      <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="plate enter p-5 sm:p-6" style={{ ["--i" as string]: 1 }}>
          <div className="flex items-baseline justify-between">
            <label htmlFor="withdraw-slider" className="text-sm font-medium">Amount to withdraw</label>
            <span className="font-mono text-2xl font-medium tnum">{formatUsdc(amount)} <span className="font-sans text-sm text-muted-foreground">USDC</span></span>
          </div>
          <Slider id="withdraw-slider" className="mt-5" min={0} max={100} step={1} value={[pct]} disabled={locked} onValueChange={(v) => setPct(Array.isArray(v) ? v[0] : v)} aria-label="Percent of balance to withdraw" />
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
            {PRESETS.map((p) => (
              <button key={p} type="button" disabled={locked} onClick={() => setPct(p)} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-out-expo active:scale-95 disabled:opacity-50", pct === p ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                {p === 100 ? "All" : `${p}%`}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-cipher/60 p-4 transition-colors duration-300">
              <p className="text-xs font-medium text-muted-foreground">Stays encrypted</p>
              <p className="mt-2 text-xl font-medium"><Cipher value={formatUsdc(remaining)} seed={`wd-remaining`} revealed={keys.ready} suffix="USDC" className="[&>span:last-child]:text-xs" /></p>
            </div>
            <div className="rounded-lg border border-pending/30 bg-pending-soft p-4">
              <p className="text-xs font-medium text-pending">Becomes public</p>
              <p className="mt-2 font-mono text-xl font-medium tnum" key={amount.toString()}><span className="enter-fade inline-block">{formatUsdc(amount)}</span> <span className="font-sans text-xs text-muted-foreground">USDC</span></p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border p-3.5">
            <div>
              <p className="text-sm font-medium">Also unwrap to USDC</p>
              <p className="text-[13px] text-muted-foreground">Turn the wrapped token into plain USDC in one go.</p>
            </div>
            <Switch checked={unwrap} onCheckedChange={setUnwrap} disabled={locked} aria-label="Also unwrap to USDC" />
          </div>
        </section>

        <aside className="plate enter p-5" style={{ ["--i" as string]: 2 }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-sm font-semibold tracking-normal">What will happen</h2>
            <StatusBadge tone="pending">Reveals {formatUsdc(amount)}</StatusBadge>
          </div>
          <SolNotice />
          <StepList steps={steps} completed={stepper.completed} running={stepper.running} />
          {stepper.done ? (
            <Button variant="outline" className="mt-4 h-10 w-full" onClick={stepper.reset}>Withdraw again</Button>
          ) : (
            <Button className="mt-4 h-10 w-full" disabled={amount === 0n || stepper.running || !emp.hasSol} onClick={() => { if (!keys.requireKeys()) return; stepper.run(); }}>
              {stepper.running ? "Sending…" : keys.ready ? `Withdraw ${formatUsdc(amount)} USDC` : "Unlock keys to withdraw"}
            </Button>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Public wallet balance: <span className="font-mono tnum text-foreground">{formatUsdc(emp.publicUsdc)} USDC</span>{emp.publicWusdc > 0n ? <>, plus <span className="font-mono tnum text-foreground">{formatUsdc(emp.publicWusdc)} WUSDC</span> not yet unwrapped</> : null}. Withdrawals can be as small or as late as you like.</p>
        </aside>
      </div>
    </>
  );
}
