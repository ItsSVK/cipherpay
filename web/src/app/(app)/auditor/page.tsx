"use client";

import { useMemo, useState } from "react";
import { ScanSearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Address, Fingerprint } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { Segmented } from "@/components/app/segmented";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/lib/mock/store";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

const hex = (n: bigint, len = 8) => n.toString(16).padStart(len, "0");

export default function AuditorPage() {
  const keys = useKeys();
  const store = useDemoStore();
  // One auditor key covers every company on the mint, so the log spans all vaults.
  const runs = useMemo(() => Object.values(store.vaults).flatMap((v) => v.runs.map((r) => ({ ...r, company: v.name }))), [store.vaults]);
  const [pickedRun, setRunId] = useState<string | null>(null);
  const run = runs.find((r) => r.id === pickedRun) ?? runs[0];
  const runId = run?.id ?? "";
  // The auditor sees the two ciphertext halves from each payment event: lo = low 16 bits, hi = the rest.
  const entries = useMemo(() => (run?.items ?? []).map((i, n) => ({ ...i, id: `${run.id}-${n}`, lo: i.amount % 65536n, hi: i.amount / 65536n })), [run]);
  // Decryption is remembered per run and per key epoch: clearing keys or switching run starts from ciphertext.
  const [decrypted, setDecrypted] = useState<{ runId: string; epoch: number } | null>(null);
  const revealed = keys.ready && decrypted?.runId === runId && decrypted.epoch === keys.epoch;
  const sum = entries.reduce((n, e) => n + e.lo + e.hi * 65536n, 0n);

  if (!run) {
    return (
      <>
        <PageHeader title="Audit log" description="Decrypt the amounts in every payment made through the app, using the auditor key." />
        <section className="plate enter mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">No payments yet. Runs appear here once a company pays its team.</section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Decrypt the amounts in every payment made through the app, using the auditor key."
        actions={
          <Button
            onClick={() => {
              if (!keys.requireKeys()) return;
              setDecrypted(revealed ? null : { runId, epoch: keys.epoch });
            }}
            variant={revealed ? "outline" : "default"}
            className="gap-1.5"
          >
            <ScanSearchIcon /> {revealed ? "Re-encrypt" : keys.ready ? "Decrypt all" : "Import auditor key"}
          </Button>
        }
      />

      <div className="enter mb-5 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ ["--i" as string]: 1 }}>
        <Segmented label="Run" value={runId} onChange={setRunId} options={runs.map((r) => ({ value: r.id, label: r.date }))} />
        <p className="text-sm text-muted-foreground">{run.company} · {run.label} · {run.recipients} payments</p>
        <p className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
          <Fingerprint seed="auditor-wallet:ElGamal key" /> {keys.ready ? "Auditor key imported" : "Auditor key not imported"}
        </p>
      </div>

      <section className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }} aria-label="Payments in this run">
        <div className="hidden grid-cols-[1.2fr_1.3fr_1fr] gap-4 border-b bg-muted/50 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>Recipient</span>
          <span>Auditor ciphertext (low, high)</span>
          <span className="text-right">Amount</span>
        </div>
        <ul>
          {entries.map((e, i) => {
            const amount = e.lo + e.hi * 65536n;
            return (
              <li key={`${runId}-${e.id}`} className={cn("row-hover grid gap-x-4 gap-y-2 border-b px-5 py-3.5 transition-colors duration-500 last:border-b-0 md:grid-cols-[1.2fr_1.3fr_1fr] md:items-center", revealed && "bg-verified-soft/40")}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{revealed ? e.name : "Recipient"}</p>
                  <Address value={e.wallet} className="text-muted-foreground" />
                </div>
                <div className="grid gap-0.5 font-mono text-[11.5px] text-muted-foreground tnum">
                  <span>lo 0x{hex(e.lo * 2654435761n % 4294967296n)}</span>
                  <span>hi 0x{hex(e.hi * 2246822519n % 4294967296n)}</span>
                </div>
                <div className="text-left text-[15px] md:text-right">
                  <Cipher value={formatUsdc(amount)} seed={`audit-${e.id}-${e.amount}`} revealed={revealed} delay={i * 130} suffix="USDC" />
                  {revealed ? <p className="enter-fade mt-0.5 font-mono text-[10.5px] text-muted-foreground tnum">{e.lo.toString()} + {e.hi.toString()} × 2¹⁶ base units</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/50 px-5 py-3.5">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <StatusBadge tone={revealed ? "verified" : "key"}>{revealed ? "Decrypted locally" : "Encrypted"}</StatusBadge>
            <span className="hidden sm:inline">Run total as recorded in your payroll list</span>
          </div>
          <p className="font-mono text-sm font-medium tnum">
            {revealed ? <span className="enter-fade inline-block">{formatUsdc(sum)} USDC</span> : <span className="text-muted-foreground">Decrypt to total</span>}
          </p>
        </div>
      </section>
      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        The auditor reads two ciphertext halves from each payment event and recovers the amount as low + high × 2¹⁶. The key is not tied to your wallet: it is the secret set on the token, so anyone holding it can read every company&apos;s payments on it. This covers payments made through the app. A chain indexer for everything else is a later phase.
      </p>
    </>
  );
}
