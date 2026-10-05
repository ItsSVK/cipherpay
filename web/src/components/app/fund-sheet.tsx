"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useChain } from "@/components/chain/chain-state";
import { USDC_FAUCET_URL, useFundTreasury } from "@/components/chain/use-fund-treasury";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useKeys } from "@/components/crypto/key-context";
import { SolNotice } from "@/components/app/sol-notice";
import { useVault } from "@/components/app/vault-context";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc, parseUsdc } from "@/lib/format";

// Demo wallets walk the four contract instructions as separate animated steps.
const DEMO_STEPS: Step[] = [
  { label: "Wrap USDC into WUSDC", detail: "Public. Real USDC is locked and an equal confidential-capable token is minted.", visibility: "public" },
  { label: "Fund the treasury", detail: "Public transfer into the vault's treasury account.", visibility: "public" },
  { label: "Deposit confidentially", detail: "Moves the balance into the encrypted pending balance.", visibility: "encrypted" },
  { label: "Apply pending balance", detail: "Makes the deposit spendable by payroll.", visibility: "encrypted" },
];

// Real wallets send all four as ONE transaction, so the steps follow what you actually experience.
const LIVE_STEPS: Step[] = [
  { label: "Prepare in your browser", detail: "Reads the treasury and works out its new encrypted balance. Nothing leaves this tab.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "One transaction for everything below. Your wallet shows it before you sign." },
  { label: "Wrap USDC and move it into the treasury", detail: "Public. Anyone can see that your company funded its treasury, and how much.", visibility: "public" },
  { label: "Deposit it and make it spendable", detail: "The deposit becomes an encrypted balance that only your key can read.", visibility: "encrypted" },
];

export function FundSheet() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25");
  const keys = useKeys();
  const v = useVault();
  const chain = useChain();
  const live = useFundTreasury();
  const parsed = parseUsdc(amount);
  const usdc = chain.wallet?.usdc ?? 0n;
  const invalid = parsed === null || parsed <= 0n;
  const overBalance = v.isLive && !invalid && parsed > usdc;

  const mock = useStepper(DEMO_STEPS.length, 950, () => {
    if (parsed !== null) v.fund(parsed);
    toast.success("Treasury funded", { description: `${formatUsdc(parsed ?? 0n)} USDC added to the encrypted balance.` });
  });
  const act = v.isLive ? live : mock;
  const done = v.isLive ? live.phase === "done" : mock.done;
  const busy = act.running;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o && v.isLive && live.phase !== "idle") live.reset();
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon /> Fund treasury
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Fund the treasury</SheetTitle>
          <SheetDescription>Funding is public: anyone can see the company moved money in. Payroll amounts stay encrypted after the deposit.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          {v.isLive ? <SolNotice /> : null}
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="fund-amount">Amount (USDC)</Label>
              {v.isLive ? (
                <button type="button" disabled={busy || done || usdc === 0n} onClick={() => setAmount(formatUsdc(usdc).replace(/,/g, ""))} className="text-[13px] text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline">
                  Max {formatUsdc(usdc)}
                </button>
              ) : null}
            </div>
            <Input id="fund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy || done} aria-invalid={invalid || overBalance} className="h-10 font-mono text-base tnum" />
            {invalid ? <p className="text-xs text-destructive">Enter an amount with up to 6 decimals.</p> : null}
            {overBalance ? <p className="text-xs text-destructive">You have {formatUsdc(usdc)} devnet USDC in this wallet.</p> : null}
            {v.isLive ? (
              <p className="text-[13px] text-muted-foreground">
                Devnet USDC in your wallet: <span className="font-mono tnum text-foreground">{formatUsdc(usdc)}</span>.{" "}
                {usdc === 0n ? (
                  <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">Get devnet USDC from Circle&apos;s faucet</a>
                ) : null}
              </p>
            ) : null}
          </div>

          <StepList steps={v.isLive ? LIVE_STEPS : DEMO_STEPS} completed={act.completed} running={act.running} />
          {v.isLive && live.error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{live.error}</p> : null}
          {v.isLive && done ? <p role="status" className="rounded-lg bg-verified-soft px-3 py-2 text-[13px] text-verified">Confirmed on devnet. Your treasury balance updates in a moment.</p> : null}
          {v.isLive && !live.canSign ? <p className="text-[13px] text-muted-foreground">{live.cannotSignReason}</p> : null}

          {done ? (
            <Button variant="outline" onClick={() => { if (v.isLive) live.reset(); else mock.reset(); setOpen(false); }}>Done</Button>
          ) : (
            <Button
              disabled={invalid || busy || overBalance || (v.isLive && !live.canSign)}
              onClick={() => {
                if (!keys.requireKeys()) return;
                if (parsed === null) return;
                if (v.isLive) {
                  void live.run(parsed);
                  return;
                }
                mock.run();
              }}
              className="h-10"
            >
              {busy ? "Working…" : v.isLive && live.error ? "Try again" : keys.ready ? "Fund treasury" : "Unlock keys to continue"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
