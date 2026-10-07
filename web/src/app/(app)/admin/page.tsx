"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon, CheckIcon, EyeIcon, EyeOffIcon, PauseCircleIcon, PlayCircleIcon, PlusIcon, ShieldCheckIcon, WalletCardsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Address, Fingerprint } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { CopyButton } from "@/components/app/copy-button";
import { FundSheet } from "@/components/app/fund-sheet";
import { useLiveGuard } from "@/components/app/live-guard";
import { usePayrollData } from "@/components/data/payroll-data";
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { SetupVault } from "@/components/app/setup-vault";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { MetricCard } from "@/components/app/metric-card";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AdminOverview() {
  const keys = useKeys();
  const v = useVault();
  const guard = useLiveGuard();
  const payroll = usePayrollData();
  const { vault } = v;
  const shown = keys.ready && v.treasuryStatus === "ready";

  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [targetPauseState, setTargetPauseState] = useState(false);

  if (v.loading) return <PageLoading label="Reading vault configuration from devnet…" />;
  if (!v.ready) return <SetupVault />;

  const funded = vault.treasury > 0n;
  const setup = [
    { label: "Vault initialized", done: vault.created, hint: "On-chain authority established." },
    { label: "Treasury encrypted", done: vault.treasuryConfigured, hint: "Token-2022 confidential extension enabled." },
    { label: "Treasury funded", done: funded, hint: "USDC liquidity deposited for payouts." },
  ];

  const handleTogglePause = async () => {
    if (!v.isLive && !guard()) return;
    if (!(await v.setPaused(targetPauseState))) return;
    toast(targetPauseState ? "Payroll paused" : "Payroll resumed", {
      description: targetPauseState ? "Payouts blocked. Employee withdrawals remain open." : "Payouts can run again.",
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payroll Vault"
        description="Encrypted treasury balance and on-chain payroll dispatch control."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <FundSheet />
            <Link href="/admin/payroll" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
              Run payroll <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <MetricCard
          title="Treasury Balance"
          tooltip="Encrypted on-chain balance under your vault authority. Only your private key can decrypt the spendable sum."
          value={formatUsdc(vault.treasury)}
          seed={`treasury-${vault.treasury}`}
          revealed={shown}
          badgeText={shown ? "Decrypted locally" : keys.ready && v.treasuryStatus === "decrypting" ? "Decrypting…" : "Encrypted on-chain"}
          badgeTone={shown ? "verified" : "key"}
          subtitle="Encrypted on-chain. Public viewers see ciphertext."
          style={{ ["--i" as string]: 1 }}
          actions={
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {keys.ready ? (
                  <Button variant="outline" size="sm" onClick={keys.lock} className="h-8 gap-1.5 text-xs">
                    <EyeOffIcon className="size-3.5" /> Hide Balance
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => keys.setDialogOpen(true)} className="h-8 gap-1.5 text-xs">
                    <EyeIcon className="size-3.5" /> Decrypt with Key
                  </Button>
                )}
                <InfoTooltip content="Decryption is performed in this browser tab using your ephemeral session key. Plaintext values are never transmitted to any server." />
              </div>

              {v.treasuryPending > 0n && shown ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pending">
                  <span className="size-1.5 rounded-full bg-pending [animation:dot-pulse_1.5s_ease-in-out_infinite]" />
                  {formatUsdc(v.treasuryPending)} USDC pending
                </span>
              ) : null}
            </div>
          }
        >
          {v.treasuryError ? (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-failed-soft p-2.5 text-xs text-destructive" role="alert">
              {v.treasuryError}
            </p>
          ) : null}
          {!funded && v.treasuryStatus !== "locked" && v.treasuryStatus !== "decrypting" ? (
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              The treasury is currently unfunded. Click &quot;Fund treasury&quot; to deposit test USDC prior to scheduling payroll.
            </div>
          ) : null}
        </MetricCard>

        <section className="plate enter flex flex-col justify-between p-6" style={{ ["--i" as string]: 2 }} aria-labelledby="vault-h">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 id="vault-h" className="text-sm font-medium text-muted-foreground">Vault Status</h2>
                <InfoTooltip content="Active status permits scheduled payouts. Pausing blocks payouts while preserving employee withdrawal rights." />
              </div>
              <StatusBadge tone={vault.paused ? "pending" : "verified"} pulse={!vault.paused}>
                {vault.paused ? "Paused" : "Active"}
              </StatusBadge>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3.5 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Pause Payroll</p>
                <p className="text-xs text-muted-foreground">Blocks new payouts. Withdrawals remain open.</p>
              </div>
              <Switch
                checked={vault.paused}
                aria-label="Pause payroll switch"
                disabled={v.pauseBusy}
                onCheckedChange={(next) => {
                  setTargetPauseState(next);
                  setPauseConfirmOpen(true);
                }}
              />
            </div>

            {v.pauseError ? (
              <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-xs text-destructive">
                {v.pauseError}
              </p>
            ) : null}

            <dl className="mt-4 grid gap-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                <dt className="text-muted-foreground">Vault Address</dt>
                <dd className="flex items-center gap-1 font-mono">
                  <Address value={v.vaultAddress} />
                  <CopyButton value={v.vaultAddress} label="Copy vault address" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  Auditor Key
                  <InfoTooltip content="Mint-level auditor public key configured for ElGamal compliance audit trail." />
                </dt>
                <dd className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <Fingerprint seed="auditor-wallet:ElGamal key" />
                  <span>demo key</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Vault Readiness
            </p>
            <ul className="grid gap-1.5">
              {setup.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className={cn("grid size-4 place-items-center rounded-full text-white transition-colors", s.done ? "bg-verified" : "border border-border")}>
                      {s.done ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : null}
                    </span>
                    <span className={s.done ? "text-foreground font-medium" : "text-muted-foreground"}>{s.label}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="enter space-y-3" style={{ ["--i" as string]: 3 }} aria-labelledby="runs-h">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="runs-h" className="text-lg font-semibold tracking-tight text-foreground">Recent Payroll Runs</h2>
            <p className="text-xs text-muted-foreground">Batched confidential transfers executed through this vault.</p>
          </div>
          {vault.runs.length > 0 ? (
            <Link href="/admin/payroll" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}>
              New Run
            </Link>
          ) : null}
        </div>

        {payroll.status === "needs-auth" ? (
          <div className="plate flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Run records are saved off-chain and mapped to your vault authority. Sign a gasless wallet message to access run history.
            </p>
            <Button size="sm" variant="outline" disabled={payroll.signingIn} onClick={() => void payroll.signIn()}>
              {payroll.signingIn ? "Waiting for wallet…" : "Sign in to view history"}
            </Button>
          </div>
        ) : payroll.status === "loading" ? (
          <div className="plate p-8 text-center text-xs text-muted-foreground">Loading run history…</div>
        ) : vault.runs.length === 0 ? (
          <EmptyState
            icon={<WalletCardsIcon className="size-5" />}
            title="No payroll runs executed yet"
            description="Add your team in the Addresses directory, fund your treasury, and start your first confidential payroll run."
            action={
              <Link href="/admin/payroll" className={cn(buttonVariants(), "h-9 text-xs")}>
                Start First Run
              </Link>
            }
          />
        ) : (
          <div className="plate overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 text-xs">Run Label</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-right text-xs">Recipients</TableHead>
                  <TableHead className="text-right text-xs">Total Amount</TableHead>
                  <TableHead className="pr-5 text-right text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vault.runs.map((r) => (
                  <TableRow key={r.id} className="row-hover">
                    <TableCell className="pl-5 text-sm font-medium">{r.label}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="tnum text-right text-xs">{r.recipients}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium tnum">
                      {formatUsdc(r.total)} <span className="font-sans text-xs text-muted-foreground">USDC</span>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <StatusBadge tone={r.status === "done" ? "verified" : "failed"}>
                        {r.status === "done" ? "Completed" : "Needs attention"}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <DisclosureCard
        title="Compliance & Auditor Mechanics"
        description="Understanding on-chain vault visibility and Token-2022 confidential transfer controls."
      >
        <p className="mb-2">
          The treasury balance is stored in a Token-2022 confidential token account owned by the vault PDA. Balances are encrypted using ElGamal ciphertexts.
        </p>
        <p>
          The mint-level auditor key possesses the mathematical ability to decrypt transfer amounts for regulatory reporting without gaining custody or withdrawal authorization.
        </p>
      </DisclosureCard>

      <ConfirmDialog
        open={pauseConfirmOpen}
        onOpenChange={setPauseConfirmOpen}
        title={targetPauseState ? "Pause Payroll Vault?" : "Resume Payroll Vault?"}
        description={
          targetPauseState
            ? "Pausing will reject new payroll transfer batches. Individual employee withdrawal operations will remain open and unaffected."
            : "Resuming will re-enable batched confidential payroll dispatches."
        }
        confirmLabel={targetPauseState ? "Pause Vault" : "Resume Vault"}
        variant={targetPauseState ? "destructive" : "default"}
        onConfirm={handleTogglePause}
      />
    </div>
  );
}
