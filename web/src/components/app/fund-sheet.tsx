"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useKeys } from "@/components/crypto/key-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { useVault } from "@/components/app/vault-context";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc, parseUsdc } from "@/lib/format";

const STEPS: Step[] = [
  { label: "Wrap USDC into WUSDC", detail: "Public. Real USDC is locked and an equal confidential-capable token is minted.", visibility: "public" },
  { label: "Fund the treasury", detail: "Public transfer into the vault's treasury account.", visibility: "public" },
  { label: "Deposit confidentially", detail: "Moves the balance into the encrypted pending balance.", visibility: "encrypted" },
  { label: "Apply pending balance", detail: "Makes the deposit spendable by payroll.", visibility: "encrypted" },
];

export function FundSheet() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25,000");
  const keys = useKeys();
  const parsed = parseUsdc(amount);
  const invalid = parsed === null || parsed <= 0n;
  const vault = useVault();
  const guard = useLiveGuard();
  const stepper = useStepper(STEPS.length, 950, () => {
    if (parsed !== null) vault.fund(parsed);
    toast.success("Treasury funded", { description: `${formatUsdc(parsed ?? 0n)} USDC added to the encrypted balance.` });
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !stepper.running && setOpen(o)}>
      <SheetTrigger render={<Button />}>
        <PlusIcon /> Fund treasury
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Fund the treasury</SheetTitle>
          <SheetDescription>The first two steps are public. Payroll amounts stay encrypted after the deposit.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-4">
          <div className="grid gap-1.5">
            <Label htmlFor="fund-amount">Amount (USDC)</Label>
            <Input id="fund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={stepper.running || stepper.done} aria-invalid={invalid} className="h-10 font-mono text-base tnum" />
            {invalid ? <p className="text-xs text-destructive">Enter an amount with up to 6 decimals.</p> : null}
          </div>
          <StepList steps={STEPS} completed={stepper.completed} running={stepper.running} />
          {stepper.done ? (
            <Button variant="outline" onClick={() => { stepper.reset(); setOpen(false); }}>Done</Button>
          ) : (
            <Button
              disabled={invalid || stepper.running}
              onClick={() => {
                if (!keys.requireKeys()) return;
                if (!guard()) return;
                stepper.run();
              }}
              className="h-10"
            >
              {stepper.running ? "Sending transactions…" : keys.ready ? "Wrap and fund" : "Unlock keys to continue"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
