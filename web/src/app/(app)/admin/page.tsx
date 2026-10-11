"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, KeyIcon, LockIcon, PlusIcon, ShieldCheckIcon, SlidersHorizontalIcon, WalletCardsIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Address } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { CopyButton } from "@/components/app/copy-button";
import { FundSheet } from "@/components/app/fund-sheet";
import { usePayrollData } from "@/components/data/payroll-data";
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { SetupVault } from "@/components/app/setup-vault";
import { SealedAmount } from "@/components/app/sealed-amount";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { MetricCard } from "@/components/app/metric-card";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { EmptyState } from "@/components/app/empty-state";
import { DispatchControl } from "@/components/app/dispatch-control";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatUsdc, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AdminOverview() {
  const keys = useKeys();
  const v = useVault();
  const payroll = usePayrollData();
  const { vault } = v;
  const [balanceHidden, setBalanceHidden] = useState(false);
  const shown = keys.ready && v.treasuryStatus === "ready" && !balanceHidden;

  if (v.loading) return <PageLoading label="Reading vault configuration from devnet…" />;
  if (!v.ready) return <SetupVault />;

  const funded = vault.treasury > 0n;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Payroll Vault"
        description="Encrypted treasury balance and on-chain payroll dispatch control."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <FundSheet variant="outline" className="h-9 px-3.5 text-xs font-medium" />
            <Link
              href="/admin/payroll"
              className={cn(
                buttonVariants({ variant: "default", size: "default" }),
                "h-9 px-4 gap-2 text-xs font-semibold shadow-xs"
              )}
            >
              Run payroll <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        }
      />

      {/* Main Operational Overview: Executive Cryptographic Hub */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-stretch">
        {/* Left Column: Confidential Treasury Vault Component */}
        <section
          className="plate enter relative flex flex-col justify-between p-6 sm:p-7 overflow-hidden"
          style={{ ["--i" as string]: 1 }}
          aria-labelledby="treasury-heading"
        >
          {/* Subtle Ambient Decorative Glow */}
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/5 blur-3xl" aria-hidden />

          <div className="space-y-5">
            {/* Component Header: Icon + Title + Direct Decrypt Controller */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <ShieldCheckIcon className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 id="treasury-heading" className="text-sm font-semibold tracking-tight text-foreground">
                      Confidential Treasury
                    </h2>
                    <InfoTooltip content="Encrypted on-chain balance under your vault authority. Only your private session key can decrypt the spendable sum." />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Token-2022 Zero-Knowledge Ledger</p>
                </div>
              </div>

              {/* Hide / show the decrypted balance. Unlocking and locking keys lives only in the top bar. */}
              {keys.ready ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBalanceHidden((h) => !h)}
                  aria-pressed={balanceHidden}
                  className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold shadow-2xs"
                >
                  {balanceHidden ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5 text-muted-foreground" />}
                  <span>{balanceHidden ? "Show balance" : "Hide balance"}</span>
                </Button>
              ) : null}
            </div>

            {/* Hero Balance Plate */}
            <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Spendable Treasury Liquidity
                </span>
                <StatusBadge
                  tone={shown ? "verified" : keys.ready && v.treasuryStatus === "decrypting" ? "pending" : "key"}
                  pulse={keys.ready && v.treasuryStatus === "decrypting"}
                >
                  {shown ? "Decrypted locally" : keys.ready && v.treasuryStatus === "decrypting" ? "Decrypting…" : "Encrypted on-chain"}
                </StatusBadge>
              </div>

              <div className="py-0.5">
                <Cipher
                  value={formatUsdc(vault.treasury)}
                  seed={`treasury-${vault.treasury}`}
                  revealed={shown}
                  cipherText={v.treasuryCipherHex}
                  suffix="USDC"
                  size="hero"
                />
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Balances are protected by Token-2022 confidential transfers. Block explorers observe zero-knowledge ciphertext only.
              </p>

              {v.treasuryPending > 0n && shown ? (
                <div className="flex items-center gap-2 rounded-lg border border-pending/30 bg-pending-soft/70 px-3 py-1.5 text-xs font-medium text-pending">
                  <span className="size-1.5 rounded-full bg-pending [animation:dot-pulse_1.5s_ease-in-out_infinite]" />
                  {formatUsdc(v.treasuryPending)} USDC pending on-chain settlement
                </div>
              ) : null}

              {v.treasuryError ? (
                <p className="rounded-lg border border-destructive/30 bg-failed-soft p-2.5 text-xs text-destructive" role="alert">
                  {v.treasuryError}
                </p>
              ) : null}

              {!funded && v.treasuryStatus !== "locked" && v.treasuryStatus !== "decrypting" ? (
                <div className="rounded-lg border border-border/80 bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
                  Treasury is unfunded. Deposit test USDC to prepare payroll runs.
                </div>
              ) : null}
            </div>

            {/* Cryptographic Architecture Matrix */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border/70 bg-card p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Protocol</p>
                <p className="font-semibold text-foreground text-xs truncate">Token-2022 ZK</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audit Trail</p>
                <p className="font-semibold text-foreground text-xs truncate">ElGamal 256-bit</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Session Key</p>
                <p className="font-semibold text-foreground text-xs truncate">
                  {keys.ready ? "Active (RAM)" : "Locked"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <LockIcon className="size-3 text-muted-foreground" />
              Plaintext never leaves local browser memory
            </span>
          </div>
        </section>

        {/* Right Column: Vault Authority & Governance Component */}
        <section
          className="plate enter relative flex flex-col justify-between p-6 sm:p-7 overflow-hidden"
          style={{ ["--i" as string]: 2 }}
          aria-labelledby="vault-heading"
        >
          {/* Subtle Ambient Decorative Glow */}
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-verified/5 blur-3xl" aria-hidden />

          <div className="space-y-5">
            {/* Component Header: Icon + Title + Operational Status Badge */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-verified/10 text-verified shadow-2xs">
                  <SlidersHorizontalIcon className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 id="vault-heading" className="text-sm font-semibold tracking-tight text-foreground">
                      Vault Authority
                    </h2>
                    <InfoTooltip content="Active status permits scheduled payouts. Pausing blocks payouts while preserving employee withdrawal rights." />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Dispatch Control & Guardrails</p>
                </div>
              </div>

              <StatusBadge tone={vault.paused ? "pending" : "verified"} pulse={!vault.paused}>
                {vault.paused ? "Paused" : "Operational"}
              </StatusBadge>
            </div>

            {/* Pause / resume */}
            <DispatchControl />

            {/* Cryptographic Identifiers (Zero colorful rainbow boxes) */}
            <div className="grid gap-2 text-xs">
              {/* Vault PDA Identifier */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">Vault PDA</span>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                    Authority
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="tnum font-medium text-foreground">{shortAddress(v.vaultAddress, 5, 5)}</span>
                  <CopyButton value={v.vaultAddress} label="Copy vault address" />
                </div>
              </div>

              {/* Auditor Key Identifier */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3">
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <KeyIcon className="size-3.5 text-muted-foreground" />
                  <span>Auditor Key</span>
                  <InfoTooltip content="Mint-level auditor public key configured for ElGamal compliance audit trail." />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-mono text-xs text-foreground font-medium">ElGamal Compliance</span>
                  <span className="size-1.5 rounded-full bg-verified" aria-hidden />
                </div>
              </div>
            </div>
          </div>

        </section>
      </div>

      {/* Recent Payroll Runs Table */}
      <section className="enter space-y-3.5" style={{ ["--i" as string]: 3 }} aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="runs-heading" className="font-serif font-normal tracking-[-0.015em] text-[1.375rem] text-foreground">
              Recent payroll runs
            </h2>
            <p className="text-xs text-muted-foreground">Batched confidential transfers executed through this vault.</p>
          </div>
          {vault.runs.length > 0 ? (
            <Link
              href="/admin/payroll"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 px-3 text-xs font-medium")}
            >
              New Run
            </Link>
          ) : null}
        </div>

        {payroll.status === "needs-auth" ? (
          <div className="plate flex flex-wrap items-center justify-between gap-4 p-6">
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
            <div className="w-full overflow-x-auto min-w-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/70 bg-muted/30 hover:bg-muted/30">
                    <TableHead className="ps-6 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Run Label
                    </TableHead>
                    <TableHead className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Date
                    </TableHead>
                    <TableHead className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Recipients
                    </TableHead>
                    <TableHead className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Total Amount
                    </TableHead>
                    <TableHead className="pe-6 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vault.runs.map((r) => (
                    <TableRow key={r.id} className="row-hover border-b border-border/50 last:border-0 transition-colors">
                      <TableCell className="ps-6 py-4 text-sm font-medium text-foreground">
                        {r.label}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-xs text-muted-foreground">
                        {r.date}
                      </TableCell>
                      <TableCell className="px-4 py-4 tnum font-mono text-end text-xs text-muted-foreground">
                        {r.recipients}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-end font-mono text-sm font-semibold tnum text-foreground">
                        {r.sealed ? (
                          <SealedAmount status={v.recordsStatus} />
                        ) : (
                          <>
                            {formatUsdc(r.total)}{" "}
                            <span className="font-sans text-xs font-normal text-muted-foreground">USDC</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="pe-6 py-4 text-end">
                        <StatusBadge tone={r.status === "done" ? "verified" : "failed"}>
                          {r.status === "done" ? "Completed" : "Needs attention"}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      {/* Compliance & Auditor Documentation Disclosure */}
      <DisclosureCard
        title="Compliance & Auditor Mechanics"
        description="Understanding on-chain vault visibility and Token-2022 confidential transfer controls."
      >
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            The treasury balance is stored in a Token-2022 confidential token account owned by the vault PDA. Balances are encrypted using ElGamal ciphertexts.
          </p>
          <p>
            The mint-level auditor key possesses the mathematical ability to decrypt transfer amounts for regulatory reporting without gaining custody or withdrawal authorization.
          </p>
        </div>
      </DisclosureCard>

    </div>
  );
}
