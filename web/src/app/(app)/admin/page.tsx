"use client";

import Link from "next/link";
import { ArrowRightIcon, CheckIcon, EyeIcon } from "lucide-react";
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
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { SetupVault } from "@/components/app/setup-vault";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AdminOverview() {
  const keys = useKeys();
  const v = useVault();
  const guard = useLiveGuard();
  const { vault } = v;
  const shown = keys.ready && v.treasuryStatus === "ready";

  if (v.loading) return <PageLoading label="Reading your vault from devnet…" />;
  if (!v.ready) return <SetupVault />;

  const funded = vault.treasury > 0n;
  const setup = [
    { label: "Vault created", done: vault.created },
    { label: "Treasury account encrypted", done: vault.treasuryConfigured },
    { label: "Treasury funded", done: funded },
  ];

  return (
    <>
      <PageHeader
        title="Payroll vault"
        description="Your treasury is encrypted. Only your key can read the balance."
        actions={
          <>
            <FundSheet />
            <Link href="/admin/payroll" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
              Run payroll <ArrowRightIcon />
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="plate enter p-6" style={{ ["--i" as string]: 1 }} aria-labelledby="treasury-h">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="treasury-h" className="font-sans text-sm font-medium text-muted-foreground">Treasury balance</h2>
              <p className="mt-1 text-xs text-muted-foreground">Encrypted on-chain. The public sees ciphertext.</p>
            </div>
            <StatusBadge tone={shown ? "verified" : "key"}>{shown ? "Decrypted locally" : keys.ready && v.treasuryStatus === "decrypting" ? "Decrypting…" : "Encrypted"}</StatusBadge>
          </div>
          <div className="mt-6 text-[2.5rem] font-medium leading-none sm:text-5xl">
            <Cipher value={formatUsdc(vault.treasury)} seed={`treasury-${vault.treasury}`} revealed={shown} suffix="USDC" className="[&>span:last-child]:text-base" />
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {keys.ready ? (
              <Button variant="outline" onClick={keys.lock}>
                Hide balance
              </Button>
            ) : (
              <Button onClick={() => keys.setDialogOpen(true)} className="gap-2">
                <EyeIcon /> Decrypt with my key
              </Button>
            )}
            <p className="text-[13px] text-muted-foreground">Decryption happens in this tab. Nothing is sent to a server.</p>
          </div>
          {v.treasuryError ? <p className="mt-5 rounded-lg border border-destructive/30 bg-failed-soft p-3 text-[13px] text-destructive" role="alert">{v.treasuryError}</p> : null}
          {v.treasuryPending > 0n && shown ? <p className="mt-5 rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">{formatUsdc(v.treasuryPending)} USDC has been deposited but is still pending. Apply it to make it spendable by payroll.</p> : null}
          {!funded && v.treasuryStatus !== "locked" && v.treasuryStatus !== "decrypting" ? <p className="mt-5 rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">The treasury is empty. Use Fund treasury to add USDC before running payroll.</p> : null}
        </section>

        <section className="plate enter p-6" style={{ ["--i" as string]: 2 }} aria-labelledby="vault-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="vault-h" className="font-sans text-sm font-medium text-muted-foreground">Vault status</h2>
            <StatusBadge tone={vault.paused ? "pending" : "verified"} pulse={!vault.paused}>{vault.paused ? "Paused" : "Active"}</StatusBadge>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-3.5">
            <div>
              <p className="text-sm font-medium">Pause payroll</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Blocks new payouts. Employees can still withdraw.</p>
            </div>
            <Switch
              checked={vault.paused}
              aria-label="Pause payroll"
              onCheckedChange={(on) => {
                if (!guard()) return;
                v.setPaused(on);
                toast(on ? "Payroll paused" : "Payroll resumed", { description: on ? "Withdrawals stay open." : "Payouts can run again." });
              }}
            />
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Vault</dt>
              <dd className="flex items-center gap-1"><Address value={v.vaultAddress} /><CopyButton value={v.vaultAddress} label="Copy vault address" /></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Auditor key</dt>
              <dd className="flex items-center gap-2 font-mono text-[12.5px]"><Fingerprint seed="auditor-wallet:ElGamal key" /> demo key</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The auditor key is set on the token, not in your vault, so every company on this token shares one auditor. The devnet key is a throwaway whose secret is on record. Rotate it before real funds.
          </p>
          <ul className="mt-5 grid gap-1.5 border-t pt-4">
            {setup.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                <span className={cn("grid size-4 place-items-center rounded-full", s.done ? "bg-verified text-white" : "border border-input")}>{s.done ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : null}</span>
                <span className={s.done ? undefined : "text-muted-foreground"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="enter mt-8" style={{ ["--i" as string]: 3 }} aria-labelledby="runs-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="runs-h" className="font-sans text-base font-semibold tracking-normal">Recent runs</h2>
        </div>
        {vault.runs.length === 0 ? (
          <div className="plate p-8 text-center text-sm text-muted-foreground">No payroll runs yet. Add your team, then run payroll.</div>
        ) : (
          <div className="plate overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Run</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="pr-5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vault.runs.map((r) => (
                  <TableRow key={r.id} className="row-hover">
                    <TableCell className="pl-5 font-medium">{r.label}</TableCell>
                    <TableCell className="text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="tnum text-right">{r.recipients}</TableCell>
                    <TableCell className="text-right font-mono tnum">{formatUsdc(r.total)}</TableCell>
                    <TableCell className="pr-5 text-right"><StatusBadge tone={r.status === "done" ? "verified" : "failed"}>{r.status === "done" ? "Done" : "Needs attention"}</StatusBadge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
