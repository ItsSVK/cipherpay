"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useStepper } from "@/hooks/use-stepper";
import { PageHeader } from "./page-header";
import { useVault } from "./vault-context";

// initialize_vault, then configure_treasury_account (create the vault-owned token account, reallocate, register the key).
const STEPS: Step[] = [
  { label: "Create your payroll vault", detail: "A vault account that only your wallet can administer. One per wallet and mint.", visibility: "public" },
  { label: "Create the treasury account", detail: "A token account owned by the vault, so the program can pay out on your behalf." },
  { label: "Make room for confidential balances", detail: "Reallocates the account for the confidential extension." },
  { label: "Register your encryption key", detail: "Proves you hold the key that decrypts the treasury balance.", visibility: "encrypted" },
];

/** First-run flow for a wallet with no vault. The rest of the admin area opens once this finishes. */
export function SetupVault() {
  const keys = useKeys();
  const v = useVault();
  const stepper = useStepper(STEPS.length, 950, () => {
    v.initialize();
    v.configureTreasury();
    toast.success("Vault ready", { description: "Next, fund the treasury." });
  });

  return (
    <>
      <PageHeader title="Set up your payroll vault" description="One-time setup, about four transactions. Your wallet pays the network fees." />
      <section className="plate enter mx-auto max-w-xl p-6" style={{ ["--i" as string]: 1 }}>
        <StepList steps={STEPS} completed={stepper.completed} running={stepper.running} />
        <Button
          className="mt-5 h-10 w-full"
          disabled={stepper.running || stepper.done}
          onClick={() => {
            if (!keys.requireKeys()) return;
            stepper.run();
          }}
        >
          {stepper.running ? "Setting up…" : keys.ready ? "Create vault" : "Unlock keys to continue"}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Your encryption key is derived from a wallet signature and never leaves this browser. The auditor key is set on the mint, not here.
        </p>
      </section>
    </>
  );
}
