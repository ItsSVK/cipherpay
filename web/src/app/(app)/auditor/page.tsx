"use client";

import { useMemo, useState } from "react";
import { LockIcon, ScanSearchIcon, ShieldCheckIcon, UnlockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Address, Fingerprint } from "@/components/crypto/fingerprint";
import { Cipher } from "@/components/crypto/cipher";
import { useKeys } from "@/components/crypto/key-context";
import { Segmented } from "@/components/app/segmented";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useDemoStore } from "@/lib/mock/store";
import { formatUsdc } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

const hex = (n: bigint, len = 8) => n.toString(16).padStart(len, "0");

export default function AuditorPage() {
  const keys = useKeys();
  const store = useDemoStore();
  const runs = useMemo(
    () => Object.values(store.vaults).flatMap((v) => v.runs.map((r) => ({ ...r, company: v.name }))),
    [store.vaults]
  );
  const [pickedRun, setRunId] = useState<string | null>(null);
  const run = runs.find((r) => r.id === pickedRun) ?? runs[0];
  const runId = run?.id ?? "";

  const entries = useMemo(
    () => (run?.items ?? []).map((i, n) => ({ ...i, id: `${run.id}-${n}`, lo: i.amount % 65536n, hi: i.amount / 65536n })),
    [run]
  );

  const [decrypted, setDecrypted] = useState<{ runId: string; epoch: number } | null>(null);
  const revealed = keys.ready && decrypted?.runId === runId && decrypted.epoch === keys.epoch;
  const sum = entries.reduce((n, e) => n + e.lo + e.hi * 65536n, 0n);

  if (!run) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Compliance & Audit Log"
          description="Decrypt and audit confidential Token-2022 payroll transfer events using the mint auditor key."
        />
        <EmptyState
          icon={<ShieldCheckIcon className="size-5" />}
          title="No payroll runs recorded yet"
          description="Payment audit records will populate automatically once vaults on this token mint complete payroll transfers."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance & Audit Log"
        description="Decrypt and audit confidential Token-2022 payroll transfer events using the mint auditor key."
        actions={
          <Button
            onClick={() => {
              if (!keys.requireKeys()) return;
              setDecrypted(revealed ? null : { runId, epoch: keys.epoch });
            }}
            variant={revealed ? "outline" : "default"}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <ScanSearchIcon className="size-3.5" />
            {revealed ? "Re-encrypt" : keys.ready ? "Decrypt All Records" : "Import Auditor Key"}
          </Button>
        }
      />

      <div className="enter flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4" style={{ ["--i" as string]: 1 }}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Run"
            value={runId}
            onChange={setRunId}
            options={runs.map((r) => ({ value: r.id, label: r.date }))}
          />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{run.company}</span> · {run.label} · {run.recipients} payment{run.recipients === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Fingerprint seed="auditor-wallet:ElGamal key" />
          <span>{keys.ready ? "Auditor key active" : "Auditor key locked"}</span>
          <InfoTooltip content="Auditor key is configured on the Token-2022 mint and enables authorized auditing without custody of vault assets." />
        </div>
      </div>

      <section className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }} aria-label="Payments in this run">
        <div className="hidden grid-cols-[1.2fr_1.3fr_1fr] gap-4 border-b bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>Recipient</span>
          <span className="flex items-center gap-1">
            Auditor Ciphertext (Low, High)
            <InfoTooltip content="Token-2022 encodes amounts into two ElGamal ciphertexts (low 16-bits and high remainder) to enable fast discrete log decryption." />
          </span>
          <span className="text-right">Decrypted Amount</span>
        </div>
        <ul className="divide-y divide-border/60">
          {entries.map((e, i) => {
            const amount = e.lo + e.hi * 65536n;
            return (
              <li
                key={`${runId}-${e.id}`}
                className={cn(
                  "row-hover grid gap-x-4 gap-y-2 px-5 py-3.5 transition-colors duration-300 md:grid-cols-[1.2fr_1.3fr_1fr] md:items-center",
                  revealed && "bg-verified-soft/30"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{revealed ? e.name : "Encrypted Recipient"}</p>
                  <Address value={e.wallet} className="text-xs text-muted-foreground font-mono" />
                </div>
                <div className="grid gap-0.5 font-mono text-xs text-muted-foreground tnum">
                  <span>lo 0x{hex(e.lo * 2654435761n % 4294967296n)}</span>
                  <span>hi 0x{hex(e.hi * 2246822519n % 4294967296n)}</span>
                </div>
                <div className="text-left md:text-right">
                  <Cipher
                    value={formatUsdc(amount)}
                    seed={`audit-${e.id}-${e.amount}`}
                    revealed={revealed}
                    delay={i * 100}
                    suffix="USDC"
                    className="font-mono text-base font-semibold tnum text-foreground"
                  />
                  {revealed ? (
                    <p className="enter-fade mt-0.5 font-mono text-[10.5px] text-muted-foreground tnum">
                      {e.lo.toString()} + {e.hi.toString()} × 2¹⁶ units
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge tone={revealed ? "verified" : "key"}>
              {revealed ? "Decrypted locally" : "Encrypted on-chain"}
            </StatusBadge>
            <span className="hidden sm:inline">Run total calculated from ElGamal plaintext recovery</span>
          </div>
          <p className="font-mono text-sm font-semibold tnum text-foreground">
            {revealed ? (
              <span className="enter-fade inline-block">{formatUsdc(sum)} USDC</span>
            ) : (
              <span className="text-muted-foreground font-sans text-xs">Unlock auditor key to total</span>
            )}
          </p>
        </div>
      </section>

      <DisclosureCard
        title="ElGamal Discrete Log Decomposition & Regulatory Compliance"
        description="How regulatory auditors can verify payment amounts without compromising recipient key secrecy."
      >
        <p className="mb-2">
          The Token-2022 confidential transfer extension splits transfer amounts into low and high 16-bit blocks. This allows discrete logarithm decryption to complete in sub-millisecond time on the client device without searching massive 64-bit keyspaces.
        </p>
        <p>
          The auditor public key is registered directly on the token mint. Every confidential transfer generates an additional ElGamal ciphertext encrypted under this auditor key, providing non-custodial audit transparency.
        </p>
      </DisclosureCard>
    </div>
  );
}
