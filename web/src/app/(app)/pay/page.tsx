"use client";

import { EyeIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { StepList, type Step } from "@/components/crypto/step-list";
import { useActivation } from "@/components/chain/use-activation";
import { useEmployee } from "@/components/app/employee-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { SolNotice } from "@/components/app/sol-notice";
import { StatusBadge } from "@/components/app/status-badge";
import { WithdrawSheet } from "@/components/app/withdraw-sheet";
import { useStepper } from "@/hooks/use-stepper";
import { formatUsdc } from "@/lib/format";

const ACTIVATE_STEPS: Step[] = [
  { label: "Prove you hold the key", detail: "A short proof, built in your browser, that the key you are registering is really yours.", visibility: "encrypted" },
  { label: "Approve in your wallet", detail: "One transaction. Your wallet shows it to you before you sign." },
  { label: "Create and register your account", detail: "In that one transaction: creates your wrapped-USDC token account, makes room for confidential balances and registers your key." },
];

const APPLY_STEPS: Step[] = [{ label: "Apply pending balance", detail: "Moves new payments into your spendable balance.", visibility: "encrypted" }];

/** Personal side of the app: balances, payments and withdrawal, for any wallet that gets paid. */
export default function MyPay() {
  const keys = useKeys();
  const emp = useEmployee();
  const guard = useLiveGuard();
  // Show amounts only once they exist in plaintext: keys unlocked AND the balance decrypted.
  const shown = keys.ready && emp.balanceStatus === "ready";
  const activation = useStepper(ACTIVATE_STEPS.length, 950, () => { emp.activate(); toast.success("Account activated", { description: "You can now receive confidential payments." }); });
  const live = useActivation();
  const act = emp.isLive ? live : activation;
  const apply = useStepper(1, 1100, () => { emp.applyPending(); toast.success("Pending balance applied"); });

  if (emp.loading) return <PageLoading />;

  if (!emp.activated) {
    return (
      <>
        <PageHeader title="Set up to receive pay" description="Before anyone can pay this wallet, it needs a confidential account. You do this once." />
        <section className="plate enter mx-auto max-w-xl p-6" style={{ ["--i" as string]: 1 }}>
          <SolNotice />
          <p className="mb-4 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
            It is one account per wallet, not one per employer. Every company that pays this wallet pays into the same account, so you never repeat this. Until it exists there is no balance to show, and nobody can send you pay.
          </p>
          <StepList steps={ACTIVATE_STEPS} completed={act.completed} running={act.running} />
          {emp.isLive && live.error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{live.error}</p> : null}
          {emp.isLive && live.phase === "done" ? <p role="status" className="mt-3 rounded-lg bg-verified-soft px-3 py-2 text-[13px] text-verified">Confirmed on devnet. Reading your new account…</p> : null}
          {emp.isLive && !live.canSign ? <p className="mt-3 text-[13px] text-muted-foreground">{live.cannotSignReason}</p> : null}
          <Button
            className="mt-5 h-10 w-full"
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
            {act.running ? "Activating…" : live.error && emp.isLive ? "Try again" : keys.ready ? "Activate account" : "Unlock keys to activate"}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">You pay the network fee in SOL for each transaction you send, so keep a little SOL in this wallet. An employer cannot pay you until this is done.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My pay" description="Only you can read these amounts. Decryption happens in this tab." actions={<WithdrawSheet />} />
      <SolNotice />
      {emp.awaitingApproval ? (
        <p className="mb-4 rounded-lg border border-pending/25 bg-pending-soft px-3.5 py-3 text-[13.5px] text-pending" role="status">Your account is set up but not approved yet, so it can&apos;t receive confidential pay. This mint requires approval for new accounts.</p>
      ) : null}
      {emp.balanceError ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-failed-soft px-3.5 py-3 text-[13.5px] text-destructive" role="alert">{emp.balanceError}</p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { id: "available", title: "Available", note: "Ready to withdraw", value: emp.available },
          { id: "pending", title: "Pending", note: "New payments waiting to be applied", value: emp.pending },
        ].map((b, i) => (
          <section key={b.id} className="plate enter p-5" style={{ ["--i" as string]: i + 1 }} aria-label={b.title}>
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-sm font-medium text-muted-foreground">{b.title}</h2>
              <StatusBadge tone={shown ? "verified" : "key"}>{shown ? "Decrypted" : keys.ready && emp.balanceStatus === "decrypting" ? "Decrypting…" : "Encrypted"}</StatusBadge>
            </div>
            <div className="mt-4 text-4xl font-medium leading-none">
              <Cipher value={formatUsdc(b.value)} seed={`emp-${b.id}-${b.value}`} revealed={shown} suffix="USDC" className="[&>span:last-child]:text-sm" />
            </div>
            <div className="mt-4 flex min-h-8 items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">{b.note}</p>
              {b.id === "pending" && emp.pending > 0n ? (
                <Button size="sm" disabled={apply.running || !emp.hasSol} onClick={() => { if (!keys.requireKeys()) return; if (!guard()) return; apply.run(); }}>
                  {apply.running ? "Applying…" : "Apply"}
                </Button>
              ) : null}
            </div>
            {b.id === "pending" && apply.running ? <StepList className="mt-3" steps={APPLY_STEPS} completed={apply.completed} running={apply.running} /> : null}
          </section>
        ))}
      </div>

      <section className="enter mt-8" style={{ ["--i" as string]: 3 }} aria-labelledby="pay-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pay-h" className="font-sans text-base font-semibold tracking-normal">Payments</h2>
          {!shown && !emp.balanceError ? (
            <Button variant="outline" size="sm" disabled={keys.ready} onClick={() => keys.setDialogOpen(true)}><EyeIcon /> Decrypt amounts</Button>
          ) : null}
        </div>
        {emp.payments.length === 0 ? (
          <div className="plate p-8 text-center text-sm text-muted-foreground">{emp.isLive ? "Per-payment history will appear here once payments are indexed. Your balances above are read live from devnet." : "Account active. Nothing received yet. When an employer pays this wallet, it shows up here."}</div>
        ) : (
          <ul className="plate overflow-hidden">
            {emp.payments.map((p, i) => (
              <li key={p.id} className="row-hover flex items-center justify-between gap-4 border-b px-4 py-3.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.from}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.date}
                    <a href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline-offset-2 hover:text-foreground hover:underline">
                      {p.signature.slice(0, 6)}… <ExternalLinkIcon className="size-3" />
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={p.status === "pending" ? "pending" : "neutral"} className="hidden sm:inline-flex">{p.status === "pending" ? "Pending" : "Applied"}</StatusBadge>
                  <span className="text-[15px]"><Cipher value={formatUsdc(p.amount)} seed={`pay-${p.id}`} revealed={shown} delay={i * 120} suffix="USDC" /></span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!emp.isLive ? (
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Your balances above are decrypted from the chain. The per-payment list comes from your employer&apos;s payroll record, because the chain only stores the combined encrypted balance.
          </p>
        ) : null}
      </section>
    </>
  );
}
