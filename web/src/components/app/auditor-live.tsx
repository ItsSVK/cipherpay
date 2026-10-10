"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { address, type Address } from "@solana/kit";
import { ExternalLinkIcon, LockIcon, ScanSearchIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Address as AddressText } from "@/components/crypto/fingerprint";
import { findVaultPda } from "@/generated/vault/src/generated";
import { checkAuditorSecret, fetchAuditorPayments, openAuditorPayments, parseAuditorSecret, resolveTokenOwners, type AuditorPayment } from "@/lib/chain/auditor-decrypt";
import { DEVNET_WUSDC_MINT } from "@/lib/chain/constants";
import { readAuditorPubkey } from "@/lib/chain/read";
import { rpc } from "@/lib/chain/rpc";
import { formatUsdc } from "@/lib/format";

interface Row extends AuditorPayment {
  /** The recipient's wallet where the chain could say, else null. */
  owner: Address | null;
  /** The decrypted amount, or null if it did not open under this key. */
  amount: bigint | null;
}

type Phase = "idle" | "working" | "ready";

const when = (t: number | null) => (t === null ? "unknown time" : new Date(t * 1000).toLocaleString());
const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

/**
 * The real auditor view: decrypts the payments of one vault from the chain with the auditor's ElGamal secret. The secret lives in a ref
 * for as long as the page is unlocked (never state, storage or a request) and is zeroed on lock and on leaving the page.
 */
export function LiveAuditor() {
  const [employer, setEmployer] = useState("");
  const [secretText, setSecretText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [scanned, setScanned] = useState(0);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const secretRef = useRef<Uint8Array | null>(null);
  const vaultRef = useRef<Address | null>(null);
  const runRef = useRef(0);

  const wipe = () => {
    secretRef.current?.fill(0);
    secretRef.current = null;
  };
  useEffect(
    () => () => {
      runRef.current += 1;
      wipe();
    },
    [],
  );

  const lock = () => {
    runRef.current += 1;
    wipe();
    vaultRef.current = null;
    setRows([]);
    setScanned(0);
    setNextBefore(null);
    setSecretText("");
    setError(null);
    setPhase("idle");
  };

  /** Reads one page of the vault's history and decrypts it. `first` also checks the key and finds the vault. */
  async function load(first: boolean) {
    const mine = ++runRef.current;
    const stale = () => mine !== runRef.current;
    setError(null);
    setPhase("working");
    try {
      if (first) {
        let admin: Address;
        try {
          admin = address(employer.trim());
        } catch {
          throw new Error("That doesn't look like a wallet address. Paste the employer's admin wallet.");
        }
        const secret = parseAuditorSecret(secretText);
        if (!secret) throw new Error("The auditor secret should be 32 bytes, as base64, hex or a JSON array.");
        setStep("Checking the key against the mint's auditor key…");
        const onMint = await readAuditorPubkey(rpc);
        if (stale()) return secret.fill(0);
        if (!(await checkAuditorSecret(secret, onMint))) {
          secret.fill(0);
          throw new Error(`This key is not the auditor key registered on the WUSDC mint (${onMint}), so it cannot decrypt these payments.`);
        }
        wipe();
        secretRef.current = secret;
        setSecretText("");
        const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
        vaultRef.current = vault;
        setRows([]);
        setScanned(0);
        setNextBefore(null);
      }
      const secret = secretRef.current;
      const vault = vaultRef.current;
      if (!secret || !vault) return;
      setStep("Reading the vault's transactions…");
      const page = await fetchAuditorPayments(rpc, vault, { before: first ? undefined : (nextBefore ?? undefined) });
      if (stale()) return;
      setStep("Decrypting…");
      const [amounts, owners] = await Promise.all([openAuditorPayments(page.payments, secret), resolveTokenOwners(rpc, page.payments.map((p) => p.employeeTokenAccount))]);
      if (stale() || !secretRef.current) return;
      const fresh = page.payments.map((p, i): Row => ({ ...p, amount: amounts[i], owner: owners[p.employeeTokenAccount] ?? null }));
      setRows((old) => (first ? fresh : [...old, ...fresh]));
      setScanned((n) => (first ? 0 : n) + page.scanned);
      setNextBefore(page.nextBefore);
      setPhase("ready");
    } catch (e) {
      if (stale()) return;
      setError(e instanceof Error ? e.message : "Something went wrong reading the chain.");
      setPhase(secretRef.current ? "ready" : "idle");
    } finally {
      if (!stale()) setStep("");
    }
  }

  const total = useMemo(() => rows.reduce((n, r) => n + (r.amount ?? 0n), 0n), [rows]);
  const unreadable = rows.filter((r) => r.amount === null).length;
  const unlocked = phase === "ready";
  const busy = phase === "working";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance & Audit Log"
        description="Decrypt the payment amounts of one vault straight from devnet with the mint's auditor key. Everything happens in this tab."
        actions={
          unlocked ? (
            <Button onClick={lock} variant="outline" className="h-9 gap-1.5 text-xs font-medium">
              <LockIcon className="size-3.5" /> Lock and clear
            </Button>
          ) : null
        }
      />

      {!unlocked ? (
        <section className="plate enter grid gap-4 p-5 sm:max-w-xl" aria-label="Auditor access">
          <div className="grid gap-1.5">
            <Label htmlFor="auditor-employer" className="text-xs font-medium">Employer wallet</Label>
            <Input
              id="auditor-employer"
              value={employer}
              onChange={(e) => setEmployer(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="The admin wallet that owns the vault"
              className="h-9 font-mono text-xs"
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">Public information. The vault address is derived from it.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auditor-secret-live" className="text-xs font-medium">Auditor secret key</Label>
            <Input
              id="auditor-secret-live"
              type="password"
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="32 bytes as base64, hex or a JSON array"
              className="h-9 font-mono text-xs"
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">Checked against the key registered on the mint, held in memory only, never stored or sent.</p>
          </div>
          {error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button onClick={() => load(true)} disabled={busy || !employer.trim() || !secretText.trim()} className="h-9 gap-1.5 text-xs font-medium">
              <ScanSearchIcon className="size-3.5" /> {busy ? "Working…" : "Decrypt payments"}
            </Button>
            {busy && step ? <span className="text-xs text-muted-foreground" role="status">{step}</span> : null}
          </div>
        </section>
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            icon={<ShieldCheckIcon className="size-5" />}
            title="No payments found in the part of the history read"
            description={`Looked at ${scanned} transaction${scanned === 1 ? "" : "s"} of this vault. ${nextBefore ? "There are older ones." : "That is all of its history."}`}
          />
          {nextBefore ? (
            <Button onClick={() => load(false)} disabled={busy} variant="outline" className="h-9 text-xs font-medium">
              {busy ? "Reading…" : "Read older transactions"}
            </Button>
          ) : null}
        </>
      ) : (
        <section className="plate enter overflow-hidden" aria-label="Decrypted payments">
          <div className="hidden grid-cols-[1.3fr_1.2fr_1fr] gap-4 border-b bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>Recipient</span>
            <span className="flex items-center gap-1">
              Transaction
              <InfoTooltip content="Each payment is read from the pay_employee instruction in this transaction. Its auditor ciphertexts are what is decrypted." />
            </span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.signature + r.employeeTokenAccount} className="row-hover grid gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[1.3fr_1.2fr_1fr] md:items-center">
                <div className="min-w-0">
                  <AddressText value={r.owner ?? r.employeeTokenAccount} className="font-mono text-xs text-foreground" />
                  <p className="text-[11px] text-muted-foreground">{r.owner ? "Recipient wallet" : "Recipient token account"} · signed by <AddressText value={r.signer} className="font-mono" /></p>
                </div>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <a href={explorer(r.signature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary underline-offset-4 hover:underline">
                    {r.signature.slice(0, 8)}…{r.signature.slice(-6)} <ExternalLinkIcon className="size-3" />
                  </a>
                  <p className="text-[11px]">{when(r.blockTime)}</p>
                </div>
                <div className="text-left md:text-right">
                  {r.amount === null ? (
                    <StatusBadge tone="failed">Doesn&apos;t decrypt</StatusBadge>
                  ) : (
                    <p className="font-mono text-sm font-semibold tnum text-foreground">{formatUsdc(r.amount)} <span className="text-xs font-normal text-muted-foreground">USDC</span></p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone="verified">Decrypted locally</StatusBadge>
              <span>
                {rows.length} payment{rows.length === 1 ? "" : "s"} in {scanned} transaction{scanned === 1 ? "" : "s"}
                {unreadable ? ` · ${unreadable} could not be decrypted` : ""}
              </span>
              {nextBefore ? (
                <Button onClick={() => load(false)} disabled={busy} variant="outline" size="sm" className="h-7 text-xs">
                  {busy ? "Reading…" : "Read older"}
                </Button>
              ) : (
                <span>· all of the vault&apos;s history</span>
              )}
            </div>
            <p className="font-mono text-sm font-semibold tnum text-foreground">{formatUsdc(total)} USDC</p>
          </div>
          {error ? (
            <p role="alert" className="border-t border-destructive/30 bg-failed-soft p-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      )}

      <p className="max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
        Covers every <span className="font-mono">pay_employee</span> the vault has received, whether or not it was made through this app. Amounts are what the program was given to
        move; recipients&apos; balances stay encrypted to them. Withdrawals and unwraps are already public and are not shown here.
      </p>
    </div>
  );
}
