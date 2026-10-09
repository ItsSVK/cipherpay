"use client";

import { EyeIcon, ExternalLinkIcon, ShieldIcon, SparklesIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useActivation } from "@/components/chain/use-activation";
import { useApplyPending } from "@/components/chain/use-receive";
import { useEmployee } from "@/components/app/employee-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { SolNotice } from "@/components/app/sol-notice";
import { StatusBadge } from "@/components/app/status-badge";
import { WithdrawSheet } from "@/components/app/withdraw-sheet";
import { MetricCard } from "@/components/app/metric-card";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { EmptyState } from "@/components/app/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTIVATE_STEPS: Step[] = [
  { label: "Prove you hold the key", detail: "A short proof, built in your browser, verifying your confidential key.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "Single transaction approval. Review before signing." },
  { label: "Create and register your account", detail: "Sets up wrapped-USDC confidential extension and registers your public encryption key." },
];

const APPLY_STEPS: Step[] = [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" }];
const LIVE_APPLY_STEPS: Step[] = [
  { label: "Prepare in your browser", detail: "Derives your new encrypted balance locally. No data leaves this tab.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "One transaction approval for the update." },
  { label: "Apply pending balance", detail: "Moves new payments into spendable balance on-chain.", visibility: "encrypted" },
];
const LIVE_APPLY_STEP: Record<string, number> = { idle: 0, preparing: 0, signing: 1, confirming: 2, done: 3, error: 0 };

export default function MyPay() {
  const keys = useKeys();
  const emp = useEmployee();
  const guard = useLiveGuard();
  const shown = keys.ready && emp.balanceStatus === "ready";
  const activation = useStepper(ACTIVATE_STEPS.length, 950, () => {
    emp.activate();
    toast.success("Account activated", { description: "You can now receive confidential payments." });
  });
  const live = useActivation();
  const act = emp.isLive ? live : activation;
  const apply = useStepper(1, 1100, () => {
    emp.applyPending();
    toast.success("Pending balance applied");
  });
  const liveApply = useApplyPending();
  const applying = emp.isLive ? liveApply.running : apply.running;

  if (emp.loading) return <PageLoading />;

  if (!emp.activated) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Confidential Account Setup"
          description="Create your encrypted Token-2022 account to begin receiving private payroll payments."
        />
        <section className="plate enter mx-auto max-w-xl p-6 sm:p-8" style={{ ["--i" as string]: 1 }}>
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
            <ShieldIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">One account for all employers</p>
              <p className="mt-0.5">Every employer pays into this confidential account. You only need to activate once.</p>
            </div>
          </div>

          <SolNotice />

          <div className="mt-6">
            <StepList steps={ACTIVATE_STEPS} completed={act.completed} running={act.running} />
          </div>

          {emp.isLive && live.error ? (
            <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {live.error}
            </p>
          ) : null}

          {emp.isLive && live.phase === "done" ? (
            <p role="status" className="mt-4 rounded-xl bg-verified-soft p-3 text-xs text-verified">
              Confirmed on devnet. Reading your new account…
            </p>
          ) : null}

          {emp.isLive && !live.canSign ? (
            <p className="mt-4 text-xs text-muted-foreground">{live.cannotSignReason}</p>
          ) : null}

          <Button
            className="mt-6 h-11 w-full font-medium"
            disabled={act.running || !emp.hasSol || live.phase === "done" || (emp.isLive && !live.canSign)}
            onClick={() => {
              if (!keys.requireKeys()) return;
              if (emp.isLive) {
                void live.run();
                return;
              }
              activation.run();
            }}
          >
            {act.running ? "Activating account…" : live.error && emp.isLive ? "Retry activation" : keys.ready ? "Activate account" : "Unlock keys to activate"}
          </Button>

          <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
            Requires ~0.005 SOL for network rent & initialization fees.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Pay"
        description="Your confidential balances and compensation history, encrypted and decrypted client-side."
        actions={<WithdrawSheet />}
      />

      <SolNotice />

      {emp.awaitingApproval ? (
        <div className="rounded-xl border border-pending/30 bg-pending-soft/70 px-4 py-3 text-xs text-pending" role="status">
          Your account is set up but awaiting mint approval. You cannot receive confidential pay until approval is granted.
        </div>
      ) : null}

      {emp.balanceError ? (
        <div className="rounded-xl border border-destructive/30 bg-failed-soft px-4 py-3 text-xs text-destructive" role="alert">
          {emp.balanceError}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <MetricCard
          title="Available Balance"
          tooltip="Confirmed, spendable balance ready to withdraw to plain USDC or transfer."
          value={formatUsdc(emp.available)}
          seed={`emp-available-${emp.available}`}
          revealed={shown}
          badgeText={shown ? "Decrypted" : keys.ready && emp.balanceStatus === "decrypting" ? "Decrypting…" : "Encrypted"}
          badgeTone={shown ? "verified" : "key"}
          subtitle="Ready for withdrawal to your wallet."
          style={{ ["--i" as string]: 1 }}
          actions={
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-muted-foreground">Unlocked locally</span>
              {!shown && !emp.balanceError ? (
                <Button variant="ghost" size="sm" onClick={() => keys.setDialogOpen(true)} className="h-8 gap-1.5 text-xs text-primary">
                  <EyeIcon className="size-3.5" /> Decrypt
                </Button>
              ) : null}
            </div>
          }
        />

        <MetricCard
          title="Pending Payments"
          tooltip="Recently received payouts waiting to be applied into your spendable confidential balance."
          value={formatUsdc(emp.pending)}
          seed={`emp-pending-${emp.pending}`}
          revealed={shown}
          badgeText={emp.pending > 0n ? "New Pay" : "Up to date"}
          badgeTone={emp.pending > 0n ? "pending" : "neutral"}
          subtitle="Apply payments to add them to your spendable balance."
          style={{ ["--i" as string]: 2 }}
          actions={
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {emp.pending > 0n ? "Action required to spend" : "No pending payments"}
              </span>
              {emp.pending > 0n ? (
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={applying || !emp.hasSol || (emp.isLive && !liveApply.canSign)}
                  onClick={() => {
                    if (!keys.requireKeys()) return;
                    if (emp.isLive) {
                      void liveApply.run();
                      return;
                    }
                    if (!guard()) return;
                    apply.run();
                  }}
                >
                  {applying ? "Applying…" : emp.isLive && liveApply.error ? "Retry" : "Apply Pay"}
                </Button>
              ) : null}
            </div>
          }
        >
          {emp.pending > 0n && !emp.isLive && apply.running ? (
            <div className="mt-3">
              <StepList steps={APPLY_STEPS} completed={apply.completed} running={apply.running} />
            </div>
          ) : null}
          {emp.pending > 0n && emp.isLive && (liveApply.running || liveApply.phase === "done") ? (
            <div className="mt-3">
              <StepList steps={LIVE_APPLY_STEPS} completed={LIVE_APPLY_STEP[liveApply.phase]} running={liveApply.running} />
            </div>
          ) : null}
          {emp.pending > 0n && emp.isLive && liveApply.error ? (
            <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-failed-soft p-2 text-xs text-destructive">
              {liveApply.error}
            </p>
          ) : null}
        </MetricCard>
      </div>

      <section className="enter space-y-3" style={{ ["--i" as string]: 3 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Payment History</h2>
            <p className="text-xs text-muted-foreground">All confidential transfers recorded for this wallet.</p>
          </div>
          {!shown && !emp.balanceError && emp.payments.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => keys.setDialogOpen(true)} className="h-8 gap-1.5 text-xs">
              <EyeIcon className="size-3.5" /> Decrypt Amounts
            </Button>
          ) : null}
        </div>

        {emp.isLive && emp.paymentsStatus === "needs-auth" ? (
          <div className="plate flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Your payment history is linked to employer payroll records. Sign in with a gasless signature to load your payments.
            </p>
            <Button size="sm" disabled={emp.paymentsSigningIn} onClick={() => void emp.signInForPayments()}>
              {emp.paymentsSigningIn ? "Signing…" : "Sign in to view history"}
            </Button>
          </div>
        ) : emp.isLive && emp.paymentsStatus === "loading" ? (
          <div className="plate p-8 text-center text-xs text-muted-foreground">Loading payment records…</div>
        ) : emp.isLive && emp.paymentsStatus === "error" ? (
          <div role="alert" className="plate border-destructive/30 bg-failed-soft p-5 text-xs text-destructive">
            {emp.paymentsError}
          </div>
        ) : emp.payments.length === 0 ? (
          <EmptyState
            icon={<WalletIcon className="size-5" />}
            title="No payments received yet"
            description="When an employer executes a payroll run to your wallet, the encrypted transfer details will appear here."
          />
        ) : (
          <div className="plate overflow-hidden">
            <ul className="divide-y divide-border/60">
              {emp.payments.map((p, i) => (
                <li key={p.id} className="row-hover flex items-center justify-between gap-4 px-5 py-4 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{p.from}</p>
                      {p.status ? (
                        <StatusBadge tone={p.status === "pending" ? "pending" : "neutral"} className="text-[10.5px]">
                          {p.status === "pending" ? "Pending" : "Applied"}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{p.date}</span>
                      {p.employer ? <span className="font-mono">from {shortAddress(p.employer)}</span> : null}
                      <a
                        href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline"
                        title="View transaction on Solana Explorer"
                      >
                        {p.signature.slice(0, 6)}…{p.signature.slice(-4)}
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    </div>
                  </div>
                  <div className="text-right">
                    {p.amount === null ? (
                      // Real payments: the employer's record keeps the amount encrypted for the employer only. It is in your balance above.
                      <span className="text-xs text-muted-foreground" title="The employer's record keeps this amount encrypted for the employer. It is included in your balance above.">
                        Amount private
                      </span>
                    ) : (
                      <Cipher
                        value={formatUsdc(p.amount)}
                        seed={`pay-${p.id}`}
                        revealed={shown}
                        delay={i * 90}
                        suffix="USDC"
                        className="font-mono text-base font-semibold tnum"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <DisclosureCard
        title="Privacy & Decryption Architecture"
        description="Learn how your balances and payment details remain confidential on Solana."
      >
        <p className="mb-2">
          Your balances above are decrypted client-side directly from your Token-2022 confidential account using ElGamal key pairs derived from your wallet signature.
        </p>
        <p>
          On-chain, third parties only observe encrypted ciphertext and zero-knowledge proofs. Payment memos and historic receipts are securely stored off-chain and verified against on-chain transaction signatures.
        </p>
      </DisclosureCard>
    </div>
  );
}
