"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeys } from "@/components/crypto/key-context";
import { PipelineTrack, RunningLine } from "@/components/crypto/pipeline-track";
import { PayrollGate } from "@/components/data/payroll-gate";
import { useOperator } from "@/components/app/operator-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { FEE_WALLET, PIPELINE_STAGES, TAX_WALLET, TRANSFER_STAGE } from "@/lib/mock/data";
import { shortToday } from "@/lib/mock/store";
import { readActivation } from "@/lib/chain/read";
import { rpc } from "@/lib/chain/rpc";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { splitAmount } from "@/lib/payroll/split";
import { checkSplit, MAX_SPLIT_ROWS, splitRunItems, toDestinations, type SplitRow } from "@/lib/payroll/split-plan";
import { useLiveRun } from "@/lib/payroll/use-live-run";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";

let rowCounter = 0;
const newKey = () => `row-${++rowCounter}`;

type Stage = "draft" | "approved" | "executing" | "done";

const colorFor = (i: number) => (i === 0 ? "var(--primary)" : `oklch(0.7 0.13 ${(i * 67 + 150) % 360})`);

export default function SplitPage() {
  return (
    <PayrollGate title="Split payout">
      <SplitBody />
    </PayrollGate>
  );
}

function SplitBody() {
  const keys = useKeys();
  const guard = useLiveGuard();
  const v = useVault();

  const [rows, setRows] = useState<SplitRow[]>(() => {
    const first = v.vault.employees[0];
    if (v.isLive) return [{ key: newKey(), name: first?.name ?? "", wallet: first?.wallet ?? "", pct: "100" }];
    return [
      { key: newKey(), name: first?.name ?? "Primary recipient", wallet: first?.wallet ?? "", pct: "79" },
      { key: newKey(), name: `${v.vault.name} tax reserve`, wallet: TAX_WALLET, pct: "20" },
      { key: newKey(), name: "Platform fee (demo wallet)", wallet: FEE_WALLET, pct: "1" },
    ];
  });
  const [primaryKey, setPrimaryKey] = useState(() => rows[0].key);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const touch = (key: string, field: string) => setTouched((t) => (t.has(`${key}:${field}`) ? t : new Set(t).add(`${key}:${field}`)));
  const [active, setActive] = useState<Record<string, boolean>>({});
  const { runSettings, live: autoLive, setModalOpen } = useOperator();
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);
  const [invoice, setInvoice] = useState("10,000");
  const [stageState, setStage] = useState<Stage>("draft");
  const [deleteRowKey, setDeleteRowKey] = useState<string | null>(null);

  const edit = (key: string, patch: Partial<SplitRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => (rs.length >= MAX_SPLIT_ROWS ? rs : [...rs, { key: newKey(), name: "", wallet: "", pct: "0" }]));
  const removeRow = (key: string) => {
    if (rows.length <= 1) return;
    const rest = rows.filter((r) => r.key !== key);
    setRows(rest);
    if (key === primaryKey) setPrimaryKey(rest[0].key);
  };

  const check = useMemo(() => checkSplit(rows, primaryKey, { validateAddresses: v.isLive }), [rows, primaryKey, v.isLive]);
  const total = parseUsdc(invoice);
  const parts = useMemo(() => {
    if (total === null || total <= 0n || !check.ok) return null;
    try { return splitAmount(total, toDestinations(rows, check.bps, primaryKey)); } catch { return null; }
  }, [total, check, rows, primaryKey]);
  const rowOf = (key: string) => rows.find((r) => r.key === key);

  const activationKey = v.isLive ? rows.map((r) => r.wallet.trim()).filter((w, i) => w && !check.errors[rows[i].key]?.wallet).join("|") : "";
  useEffect(() => {
    if (!activationKey) return;
    let cancelled = false;
    readActivation(rpc, activationKey.split("|").map((w) => address(w))).then((a) => { if (!cancelled) setActive((prev) => ({ ...prev, ...a })); }, () => undefined);
    return () => { cancelled = true; };
  }, [activationKey]);
  const isActive = (wallet: string) => (v.isLive ? !!active[wallet.trim()] : v.isActivated(wallet));

  const targets = useMemo(() => rows.map((r) => ({ id: r.key, name: r.name.trim(), wallet: r.wallet.trim() })), [rows]);
  const demoIds = useMemo(() => rows.filter((r) => (check.bps[r.key] ?? 0) > 0).map((r) => r.key), [rows, check.bps]);
  const mockSim = useRunSimulation(demoIds, PIPELINE_STAGES.length, TRANSFER_STAGE);
  const liveItems = useMemo(() => (parts && v.isLive ? splitRunItems(parts, targets) : []), [parts, v.isLive, targets]);
  const liveSim = useLiveRun(liveItems, PIPELINE_STAGES.length, runSettings);
  const sim = v.isLive ? liveSim : mockSim;
  const stage: Stage = stageState === "executing" && sim.done ? "done" : stageState;
  const halted = stage === "executing" && !sim.running && sim.failedCount > 0;

  useEffect(() => {
    for (const r of sim.rows) {
      if (r.status !== "done" || !r.signature || credited.current.has(r.id)) continue;
      credited.current.add(r.id);
      const part = parts?.find((p) => p.id === r.id);
      const row = rowOf(r.id);
      if (part && row && !v.isLive) v.pay(row.wallet, part.amount, r.signature, `${v.vault.name} split payout`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.rows]);

  useEffect(() => {
    if (stage !== "done" || recorded.current || !parts) return;
    recorded.current = true;
    const paid = parts.filter((p) => sim.rows.some((r) => r.id === p.id && r.signature));
    v.recordRun({
      id: `run-${Date.now()}`,
      label: `Split payout, ${formatUsdc(paid.reduce((n, p) => n + p.amount, 0n))} USDC`,
      date: shortToday(),
      status: "done",
      recipients: paid.length,
      total: paid.reduce((n, p) => n + p.amount, 0n),
      items: paid.map((p) => ({ wallet: rowOf(p.id)!.wallet.trim(), name: rowOf(p.id)!.name.trim(), amount: p.amount, signature: sim.rows.find((r) => r.id === p.id)?.signature ?? "" })),
    }).catch((e) => toast.error("Payout sent, but the run couldn't be saved to your history", { description: e instanceof Error ? e.message : "The payments are on-chain and unaffected." }));
    toast.success("Split payout complete", { description: `${paid.length} confidential transfer${paid.length === 1 ? "" : "s"} sent.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const locked = stage !== "draft";
  const treasuryKnown = !v.isLive || v.treasuryStatus === "ready";
  const invoiceTotal = parts ? parts.reduce((n, p) => n + p.amount, 0n) : 0n;
  const treasuryOk = !!parts && treasuryKnown && v.vault.treasury >= invoiceTotal;
  const payments = parts ? parts.filter((p) => p.amount > 0n).length : rows.length;

  const blocker: string | null = (() => {
    if (total === null || total <= 0n) return "Enter a valid invoice amount.";
    if (!check.sumValid) return check.remainingBps > 0 ? `${(check.remainingBps / 100).toFixed(2).replace(/\.?0+$/, "")}% of the invoice remains unallocated.` : `The percentages exceed 100% by ${(-check.remainingBps / 100).toFixed(2).replace(/\.?0+$/, "")}%.`;
    const bad = rows.findIndex((r) => check.errors[r.key]);
    if (bad >= 0) return `Destination ${bad + 1}: ${Object.values(check.errors[rows[bad].key])[0]}`;
    const idle = rows.findIndex((r) => !isActive(r.wallet));
    if (idle >= 0) return `${rows[idle].name.trim() || `Destination ${idle + 1}`} has not activated a confidential account yet.`;
    if (v.vault.paused) return "Payroll is paused. Resume the vault first.";
    if (v.isLive && !treasuryKnown) return "Unlock keys to verify treasury coverage.";
    if (!treasuryOk) return `Treasury balance of ${formatUsdc(v.vault.treasury)} USDC does not cover the invoice amount.`;
    return null;
  })();

  const err = (key: string, field: "name" | "wallet" | "pct") => (showAll || touched.has(`${key}:${field}`) ? check.errors[key]?.[field] : undefined);
  const pctText = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Split Payout"
        description="Divide a single invoice into proportional confidential transfers according to your distribution rules."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          <section className="plate enter p-5 sm:p-6" style={{ ["--i" as string]: 1 }}>
            <div className="grid gap-2 sm:max-w-xs">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="invoice">Invoice Amount (USDC)</Label>
                <InfoTooltip content="Total sum to be divided. The remainder from rounding is credited to the primary recipient." />
              </div>
              <Input
                id="invoice"
                inputMode="decimal"
                value={invoice}
                disabled={locked}
                onChange={(e) => setInvoice(e.target.value)}
                aria-invalid={total === null}
                className="h-11 font-mono text-lg font-medium tnum"
              />
              {total === null ? <p className="text-xs text-destructive">Enter a valid amount with up to 6 decimals.</p> : null}
            </div>

            <div className="mt-6" role="img" aria-label="Split proportions visualization">
              <div className="flex h-3.5 overflow-hidden rounded-full bg-secondary ring-1 ring-border/50">
                {rows.map((r, i) => (
                  <div
                    key={r.key}
                    className="h-full transition-[width] duration-500 ease-out-expo"
                    style={{
                      width: `${check.sumBps > 0 ? ((check.bps[r.key] ?? 0) / Math.max(check.sumBps, 10_000)) * 100 : 0}%`,
                      background: colorFor(i),
                    }}
                  />
                ))}
              </div>
            </div>

            <ul className="mt-6 divide-y divide-border/60">
              {rows.map((r, i) => {
                const part = parts?.find((p) => p.id === r.key);
                const isPrimary = r.key === primaryKey;
                return (
                  <li key={r.key} className="grid items-start gap-3 py-4 sm:grid-cols-[1fr_95px_130px]">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-3 size-3 shrink-0 rounded-full ring-2 ring-background" style={{ background: colorFor(i) }} />
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Destination ${i + 1} name`}
                            placeholder="Recipient name"
                            value={r.name}
                            disabled={locked}
                            onChange={(e) => edit(r.key, { name: e.target.value })}
                            onBlur={() => touch(r.key, "name")}
                            aria-invalid={!!err(r.key, "name")}
                            className="h-9 text-sm font-medium"
                          />
                          {isPrimary ? (
                            <div className="flex items-center gap-1">
                              <StatusBadge tone="key">Primary</StatusBadge>
                              <InfoTooltip content="Primary destination receives any fractional rounding remainder to ensure exact 100% payout balance." />
                            </div>
                          ) : null}
                        </div>
                        {err(r.key, "name") ? <p className="text-xs text-destructive">{err(r.key, "name")}</p> : null}
                        <Input
                          aria-label={`Destination ${i + 1} wallet address`}
                          placeholder="Solana wallet address"
                          spellCheck={false}
                          value={r.wallet}
                          disabled={locked}
                          onChange={(e) => edit(r.key, { wallet: e.target.value })}
                          onBlur={() => touch(r.key, "wallet")}
                          aria-invalid={!!err(r.key, "wallet")}
                          className="h-8 font-mono text-xs"
                        />
                        {err(r.key, "wallet") ? <p className="text-xs text-destructive">{err(r.key, "wallet")}</p> : null}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {r.wallet.trim() && !check.errors[r.key]?.wallet && !isActive(r.wallet) ? (
                            <StatusBadge tone="pending" className="text-[10.5px]">Not activated</StatusBadge>
                          ) : null}
                          {!locked ? (
                            <>
                              {!isPrimary ? (
                                <button type="button" onClick={() => setPrimaryKey(r.key)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                                  Set as primary
                                </button>
                              ) : null}
                              {rows.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteRowKey(r.key)}
                                  aria-label={`Remove destination ${i + 1}`}
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive hover:underline"
                                >
                                  <Trash2Icon className="size-3" /> Remove
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <div className="relative">
                        <Input
                          aria-label={`Destination ${i + 1} percent`}
                          inputMode="decimal"
                          value={r.pct}
                          disabled={locked}
                          onChange={(e) => edit(r.key, { pct: e.target.value })}
                          onBlur={() => touch(r.key, "pct")}
                          aria-invalid={!!err(r.key, "pct")}
                          className="h-9 pr-7 text-right font-mono tnum"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      {err(r.key, "pct") ? <p className="text-xs text-destructive">{err(r.key, "pct")}</p> : null}
                    </div>

                    <p className="pt-2 text-right font-mono text-sm font-medium tnum">
                      {part ? (
                        <span className="enter-fade inline-block text-foreground">{formatUsdc(part.amount)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                      <span className="ml-1 font-sans text-xs text-muted-foreground">USDC</span>
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              {!locked ? (
                <Button variant="outline" size="sm" disabled={rows.length >= MAX_SPLIT_ROWS} onClick={addRow} className="h-8 gap-1.5 text-xs">
                  <PlusIcon className="size-3.5" /> Add Destination
                </Button>
              ) : <span />}
              <p className={cn("text-xs font-medium transition-colors", check.sumValid ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
                {check.sumValid ? "Percentages total 100%." : check.remainingBps > 0 ? `Total: ${pctText(check.sumBps)}%. ${pctText(check.remainingBps)}% unallocated.` : `Total: ${pctText(check.sumBps)}%. Exceeds 100% by ${pctText(-check.remainingBps)}%.`}
              </p>
            </div>
          </section>

          {(stage === "executing" || stage === "done") && (
            <section className="plate enter overflow-hidden" aria-live="polite" aria-label="Split execution progress">
              <ul className="divide-y divide-border/60">
                {sim.rows.map((r) => (
                  <li key={r.id} className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{rowOf(r.id)?.name.trim() || "Destination"}</p>
                      <StatusBadge tone={r.status === "done" ? "verified" : r.status === "failed" ? "failed" : r.status === "running" ? "key" : "neutral"} pulse={r.status === "running"}>
                        {r.status === "done" ? "Confirmed" : r.status === "failed" ? "Failed" : r.status === "running" ? (r.waiting ? "Waiting" : "Processing") : "Queued"}
                      </StatusBadge>
                    </div>
                    {r.error ? <p role="alert" className="text-xs text-destructive">{r.error}</p> : null}
                    <PipelineTrack stages={PIPELINE_STAGES} completed={r.completed} status={r.status} compact />
                    <div className="min-h-5 text-xs">
                      {r.status === "done" ? (
                        <p className="enter-fade font-mono text-[11px] text-muted-foreground">tx {r.signature?.slice(0, 10)}…{r.signature?.slice(-6)}</p>
                      ) : (
                        <RunningLine stage={PIPELINE_STAGES[Math.min(r.completed, PIPELINE_STAGES.length - 1)]} active={r.status === "running"} waiting={r.waiting} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="plate enter p-5 sm:p-6 lg:sticky lg:top-20 space-y-5" style={{ ["--i" as string]: 2 }}>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Approval Status</h3>
            <p className="text-xs text-muted-foreground">Verify split policy prior to execution.</p>
          </div>

          <ol className="grid gap-2.5 text-xs" aria-label="Approval status stages">
            {([["draft", "Draft"], ["approved", "Approved"], ["executing", "Executing"], ["done", "Done"]] as [Stage, string][]).map(([id, label], i, all) => {
              const idx = all.findIndex(([s]) => s === stage);
              const reached = i <= idx;
              return (
                <li key={id} className={cn("flex items-center gap-2.5 transition-colors", reached ? "text-foreground font-medium" : "text-muted-foreground")}>
                  <span className={cn("grid size-4 place-items-center rounded-full text-white transition-all duration-300", i < idx ? "bg-verified" : i === idx ? "bg-primary" : "bg-muted")}>
                    {i < idx ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : i === idx ? <span className="size-1.5 rounded-full bg-white" /> : null}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>

          {v.isLive ? (
            <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-muted-foreground">Helper</span>
              <div className="flex items-center gap-1.5">
                <span className={cn(autoLive ? "text-verified font-medium" : "text-muted-foreground")}>
                  {autoLive ? "Active" : "Off"}
                </span>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-primary hover:underline text-[11px]"
                >
                  (Configure)
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 border-t border-border/60 pt-4">
            {stage === "draft" && (
              <Button
                className="h-11 w-full text-sm font-medium"
                aria-disabled={!!blocker}
                onClick={() => {
                  if (blocker) {
                    setShowAll(true);
                    toast.error("Split cannot be approved", { description: blocker });
                    return;
                  }
                  setStage("approved");
                  toast.success("Split approved", { description: "Ready for on-chain execution." });
                }}
              >
                Approve Split Rule
              </Button>
            )}

            {stage === "approved" && (
              <>
                <Button
                  className="h-11 w-full text-sm font-medium"
                  onClick={() => {
                    if (!keys.requireKeys()) return;
                    if (v.isLive) {
                      if (!liveSim.canSign) { toast.error("Wallet cannot sign devnet transactions", { description: "Try a different wallet." }); return; }
                    } else if (!guard()) return;
                    credited.current.clear();
                    recorded.current = false;
                    setStage("executing");
                    sim.start();
                  }}
                >
                  {keys.ready ? "Execute Split Payout" : "Unlock Keys to Execute"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStage("draft")}>Edit Rule</Button>
              </>
            )}

            {stage === "executing" && halted ? <Button className="h-10 w-full" onClick={() => liveSim.retryFailed()}>Retry Failed Transfers</Button> : null}
            {stage === "executing" && !halted && <Button className="h-10 w-full" disabled>Executing Transfers…</Button>}
            {stage === "done" && <Button variant="outline" className="h-10 w-full" onClick={() => { sim.reset(); credited.current.clear(); recorded.current = false; setStage("draft"); }}>Configure New Split</Button>}
          </div>

          {stage === "draft" && blocker ? (
            <p className="rounded-lg bg-pending-soft/70 p-2.5 text-xs text-pending" role="status">{blocker}</p>
          ) : null}

          {stage === "draft" && v.vault.paused ? (
            <Button size="sm" variant="outline" className="w-full text-xs" disabled={v.pauseBusy} onClick={() => { void (async () => { if (!v.isLive && !guard()) return; if (!(await v.setPaused(false))) return; toast.success("Payroll resumed"); })(); }}>
              {v.pauseBusy ? "Awaiting wallet…" : "Resume Payroll Vault"}
            </Button>
          ) : null}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {parts ? `Configured for ${payments} destination transfer${payments === 1 ? "" : "s"}.` : "Add destinations and specify percentages."}
          </p>
        </aside>
      </div>

      <DisclosureCard
        title="Off-Chain Policy & Client-Side Calculation"
        description="Why split percentages are calculated in-browser rather than enforced on-chain."
      >
        <p className="mb-2">
          Token-2022 confidential accounts store encrypted balances. Because the blockchain smart contracts cannot read the secret transfer amounts, split ratios are derived client-side and verified via zero-knowledge equality proofs.
        </p>
        <p>
          Each recipient is paid in an independent confidential transaction. Compliance auditors can verify historical adherence using the mint auditor key.
        </p>
      </DisclosureCard>

      <ConfirmDialog
        open={!!deleteRowKey}
        onOpenChange={(open) => !open && setDeleteRowKey(null)}
        title="Remove Destination?"
        description="Are you sure you want to remove this destination from the split rule?"
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (deleteRowKey) removeRow(deleteRowKey);
          setDeleteRowKey(null);
        }}
      />
    </div>
  );
}
