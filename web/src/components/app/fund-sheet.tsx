"use client";

import { useState } from "react";
import { PlusIcon, SparklesIcon } from "lucide-react";
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEMO_STEPS: Step[] = [
  { label: "Wrap USDC into WUSDC", detail: "Public. Real USDC is locked and an equal confidential-capable token is minted.", visibility: "public" },
  { label: "Fund the treasury", detail: "Public transfer into the vault's treasury account.", visibility: "public" },
  { label: "Deposit confidentially", detail: "Moves the balance into the encrypted pending balance.", visibility: "encrypted" },
  { label: "Apply pending balance", detail: "Makes the deposit spendable by payroll.", visibility: "encrypted" },
];

const LIVE_STEPS: Step[] = [
  { label: "Prepare in your browser", detail: "Reads the treasury and works out its new encrypted balance. Nothing leaves this tab.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "One transaction for everything below. Your wallet shows it before you sign." },
  { label: "Wrap USDC and move it into the treasury", detail: "Public. Anyone can see that your company funded its treasury, and how much.", visibility: "public" },
  { label: "Deposit it and make it spendable", detail: "The deposit becomes an encrypted balance that only your key can read.", visibility: "encrypted" },
];

const QUICK_AMOUNTS = ["10", "25", "50", "100"];

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
      <SheetTrigger render={<Button className="h-9 gap-1.5 text-xs font-medium" />}>
        <PlusIcon className="size-3.5" /> Fund Treasury
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Fund Treasury</SheetTitle>
          <SheetDescription>
            Deposit liquidity into your encrypted vault. Funding deposits are public on-chain; payroll distributions remain confidential.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-6 pt-2">
          {v.isLive ? <SolNotice /> : null}

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="fund-amount">Amount (USDC)</Label>
                <InfoTooltip content="USDC is wrapped into confidential Token-2022 format and deposited directly into the vault treasury account." />
              </div>
              {v.isLive ? (
                <button
                  type="button"
                  disabled={busy || done || usdc === 0n}
                  onClick={() => setAmount(formatUsdc(usdc).replace(/,/g, ""))}
                  className="text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline font-medium"
                >
                  Max: {formatUsdc(usdc)}
                </button>
              ) : null}
            </div>

            <Input
              id="fund-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy || done}
              aria-invalid={invalid || overBalance}
              className="h-11 font-mono text-lg font-medium tnum"
            />

            <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Quick amount presets">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy || done}
                  onClick={() => setAmount(q)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                    amount === q
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  +{q} USDC
                </button>
              ))}
            </div>

            {invalid ? <p className="text-xs text-destructive">Enter an amount with up to 6 decimals.</p> : null}
            {overBalance ? <p className="text-xs text-destructive">Wallet holds {formatUsdc(usdc)} devnet USDC.</p> : null}

            {v.isLive ? (
              <p className="text-xs text-muted-foreground">
                Available devnet USDC: <span className="font-mono tnum text-foreground font-medium">{formatUsdc(usdc)}</span>.{" "}
                {usdc === 0n ? (
                  <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                    Get test USDC from Circle Faucet
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3.5">
            <StepList steps={v.isLive ? LIVE_STEPS : DEMO_STEPS} completed={act.completed} running={act.running} />
          </div>

          {v.isLive && live.error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {live.error}
            </p>
          ) : null}

          {v.isLive && done ? (
            <p role="status" className="rounded-xl bg-verified-soft p-3 text-xs text-verified">
              Transaction confirmed on devnet. Treasury balance updating…
            </p>
          ) : null}

          {v.isLive && !live.canSign ? (
            <p className="text-xs text-muted-foreground">{live.cannotSignReason}</p>
          ) : null}

          {done ? (
            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={() => {
                if (v.isLive) live.reset();
                else mock.reset();
                setOpen(false);
              }}
            >
              Done
            </Button>
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
              className="h-11 w-full text-sm font-medium"
            >
              {busy ? "Processing Deposit…" : v.isLive && live.error ? "Retry Deposit" : keys.ready ? "Deposit & Encrypt" : "Unlock Keys to Continue"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
