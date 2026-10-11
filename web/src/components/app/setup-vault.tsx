"use client";

import { ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanySetup } from "@/components/chain/use-company-setup";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useEmployee } from "@/components/app/employee-context";
import { SolNotice } from "@/components/app/sol-notice";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageHeader } from "./page-header";
import { useVault } from "./vault-context";

const STEPS: Step[] = [
  { label: "Prove you hold the key", detail: "A short proof, built in your browser, verifying your confidential admin key.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "Single atomic transaction for initialization.", visibility: "public" },
  { label: "Initialize vault & treasury", detail: "Creates your vault PDA, encrypts treasury token account, and binds authority.", visibility: "encrypted" },
];

export function SetupVault() {
  const keys = useKeys();
  const v = useVault();
  const emp = useEmployee();
  const live = useCompanySetup();
  const repairing = v.vault.created && !v.vault.treasuryConfigured;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Set up your payroll vault"
        description="One-time on-chain deployment. Creates your company vault PDA and initializes encrypted Token-2022 treasury."
      />
      <section className="plate enter mx-auto max-w-xl p-6 sm:p-8" style={{ ["--i" as string]: 1 }}>
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">Non-Custodial Vault Architecture</p>
            <p className="mt-0.5">Only your connected wallet holds administrative authority over this vault. Keys remain securely in memory.</p>
          </div>
        </div>

        <SolNotice />

        {repairing ? (
          <p className="mb-4 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            Your vault was initialized earlier but its treasury configuration was interrupted. This will complete the setup.
          </p>
        ) : null}

        <div className="mt-6 rounded-xl border bg-muted/20 p-4">
          <StepList steps={STEPS} completed={live.completed} running={live.running} />
        </div>

        {live.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
            {live.error}
          </p>
        ) : null}

        {live.phase === "done" ? (
          <p role="status" className="mt-4 rounded-xl bg-verified-soft p-3 text-xs text-verified">
            Vault confirmed on devnet. Synchronizing configuration…
          </p>
        ) : null}

        {!live.canSign ? (
          <p className="mt-4 text-xs text-muted-foreground">{live.cannotSignReason}</p>
        ) : null}

        <Button
          className="mt-6 h-11 w-full text-sm font-medium"
          disabled={live.running || !emp.hasSol || live.phase === "done" || !live.canSign}
          onClick={() => {
            if (!keys.requireKeys()) return;
            void live.run();
          }}
        >
          {live.running ? "Deploying Vault…" : live.error ? "Retry Setup" : keys.ready ? (repairing ? "Complete Setup" : "Deploy Vault") : "Unlock Keys to Continue"}
        </Button>

        <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
          Your encryption key never leaves this browser tab. Gas & account rent are paid in SOL by your wallet.
        </p>
      </section>
    </div>
  );
}
