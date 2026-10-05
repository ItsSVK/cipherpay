"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCompanySetup } from "@/components/chain/use-company-setup";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useEmployee } from "@/components/app/employee-context";
import { SolNotice } from "@/components/app/sol-notice";
import { useStepper } from "@/hooks/use-stepper";
import { PageHeader } from "./page-header";
import { useVault } from "./vault-context";

// One transaction: initialize_vault + configure_treasury_account (create the vault-owned treasury token account,
// make room for the confidential extension, register the admin's key), preceded by a key proof.
const STEPS: Step[] = [
  { label: "Prove you hold the key", detail: "A short proof, built in your browser, that the key you are registering is really yours.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "One transaction. Your wallet shows it to you before you sign." },
  { label: "Create the vault and its treasury", detail: "In that one transaction: creates your vault (only your wallet can administer it), an encrypted treasury account the vault owns, and registers your key on it." },
];

/** First-run flow for a wallet with no company. The rest of the admin area opens once this finishes. */
export function SetupVault() {
  const keys = useKeys();
  const v = useVault();
  const emp = useEmployee();
  const live = useCompanySetup();
  const mock = useStepper(STEPS.length, 950, () => {
    v.initialize();
    v.configureTreasury();
    toast.success("Vault ready", { description: "Next, fund the treasury." });
  });
  const act = v.isLive ? live : mock;
  const repairing = v.isLive && v.vault.created && !v.vault.treasuryConfigured;

  return (
    <>
      <PageHeader title="Set up your payroll vault" description="One-time setup, one transaction. Your wallet pays the network fees." />
      <section className="plate enter mx-auto max-w-xl p-6" style={{ ["--i" as string]: 1 }}>
        <SolNotice />
        {repairing ? (
          <p className="mb-4 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">Your vault was created earlier but its treasury was never configured. This finishes the setup.</p>
        ) : null}
        <StepList steps={STEPS} completed={act.completed} running={act.running} />
        {v.isLive && live.error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{live.error}</p> : null}
        {v.isLive && live.phase === "done" ? <p role="status" className="mt-3 rounded-lg bg-verified-soft px-3 py-2 text-[13px] text-verified">Confirmed on devnet. Reading your new vault…</p> : null}
        {v.isLive && !live.canSign ? <p className="mt-3 text-[13px] text-muted-foreground">{live.cannotSignReason}</p> : null}
        <Button
          className="mt-5 h-10 w-full"
          disabled={act.running || !emp.hasSol || (v.isLive && (live.phase === "done" || !live.canSign)) || (!v.isLive && mock.done)}
          onClick={() => {
            if (!keys.requireKeys()) return;
            if (v.isLive) {
              void live.run();
              return;
            }
            mock.run();
          }}
        >
          {act.running ? "Setting up…" : v.isLive && live.error ? "Try again" : keys.ready ? (repairing ? "Finish setup" : "Create vault") : "Unlock keys to continue"}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Your encryption key is derived from a wallet signature and never leaves this browser. The auditor key is set on the mint, not here.
        </p>
      </section>
    </>
  );
}
