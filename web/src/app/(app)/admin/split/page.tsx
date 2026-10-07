"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeys } from "@/components/crypto/key-context";
import { PipelineTrack, RunningLine } from "@/components/crypto/pipeline-track";
import { PayrollGate } from "@/components/data/payroll-gate";
import { DEFAULT_AUTO_SETTINGS, OperatorPanel, type AutoPayrollSettings } from "@/components/app/operator-panel";
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
import { useLiveRun, type RunSettings } from "@/lib/payroll/use-live-run";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { cn } from "@/lib/utils";

let rowCounter = 0;
/** Stable ids for rows, so editing or removing one never confuses another (and the run engine can tell them apart). */
const newKey = () => `row-${++rowCounter}`;

type Stage = "draft" | "approved" | "executing" | "done";

/** The first row keeps the app's accent colour; the rest walk around the colour wheel so any number of destinations stay distinguishable. */
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

  // The admin builds the rule: any number of destinations, each with a name, a wallet and a percentage. Real wallets start from their first
  // payroll recipient at 100% and add the rest; the demo starts from its three fixed demo wallets so the sample data still works.
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
  const [auto, setAuto] = useState<AutoPayrollSettings>(DEFAULT_AUTO_SETTINGS);
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);
  const [invoice, setInvoice] = useState("10,000");
  const [stageState, setStage] = useState<Stage>("draft");

  const edit = (key: string, patch: Partial<SplitRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => (rs.length >= MAX_SPLIT_ROWS ? rs : [...rs, { key: newKey(), name: "", wallet: "", pct: "0" }]));
  const removeRow = (key: string) => {
    if (rows.length <= 1) return;
    const rest = rows.filter((r) => r.key !== key);
    setRows(rest);
    if (key === primaryKey) setPrimaryKey(rest[0].key); // the remainder always has a home
  };

  const check = useMemo(() => checkSplit(rows, primaryKey, { validateAddresses: v.isLive }), [rows, primaryKey, v.isLive]);
  const total = parseUsdc(invoice);
  const parts = useMemo(() => {
    if (total === null || total <= 0n || !check.ok) return null;
    try { return splitAmount(total, toDestinations(rows, check.bps, primaryKey)); } catch { return null; }
  }, [total, check, rows, primaryKey]);
  const rowOf = (key: string) => rows.find((r) => r.key === key);

  // Real wallets: read which of the typed-in wallets have set up their account (one batched call). Demo: the mock store knows.
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
  const maxPayments = Math.max(auto.maxPayments ?? liveItems.length, liveItems.length);
  const runSettings = useMemo<RunSettings>(() => (auto.enabled ? { mode: "automatic", terms: { ttlSeconds: auto.ttlSeconds, maxPayments } } : { mode: "manual" }), [auto.enabled, auto.ttlSeconds, maxPayments]);
  const liveSim = useLiveRun(liveItems, PIPELINE_STAGES.length, runSettings);
  const sim = v.isLive ? liveSim : mockSim;
  const stage: Stage = stageState === "executing" && sim.done ? "done" : stageState;
  const halted = stage === "executing" && !sim.running && sim.failedCount > 0;

  // Each destination is credited the moment its transfer confirms (demo balances only; real ones are on-chain).
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
    // Saved to the database for real wallets. The payments are already on-chain, so a failed save is not a failed payout.
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
  const treasuryKnown = !v.isLive || v.treasuryStatus === "ready"; // a real treasury balance is only readable while keys are unlocked
  const invoiceTotal = parts ? parts.reduce((n, p) => n + p.amount, 0n) : 0n;
  const treasuryOk = !!parts && treasuryKnown && v.vault.treasury >= invoiceTotal;
  const payments = parts ? parts.filter((p) => p.amount > 0n).length : rows.length;

  // Why Approve can't go ahead yet, in plain words. Shown under the button and used when it is pressed too early.
  const blocker: string | null = (() => {
    if (total === null || total <= 0n) return "Enter an invoice amount.";
    if (!check.sumValid) return check.remainingBps > 0 ? `${(check.remainingBps / 100).toFixed(2).replace(/\.?0+$/, "")}% of the invoice is not assigned to anyone yet.` : `The percentages are ${(-check.remainingBps / 100).toFixed(2).replace(/\.?0+$/, "")}% over 100%.`;
    const bad = rows.findIndex((r) => check.errors[r.key]);
    if (bad >= 0) return `Destination ${bad + 1}: ${Object.values(check.errors[rows[bad].key])[0]}`;
    const idle = rows.findIndex((r) => !isActive(r.wallet));
    if (idle >= 0) return `${rows[idle].name.trim() || `Destination ${idle + 1}`} hasn't set up an account to receive pay yet.`;
    if (v.vault.paused) return "Payroll is paused. Resume it first.";
    if (v.isLive && !treasuryKnown) return "Unlock your keys so the app can check the treasury.";
    if (!treasuryOk) return `The treasury holds ${formatUsdc(v.vault.treasury)} USDC, which does not cover this invoice.`;
    return null;
  })();
  const err = (key: string, field: "name" | "wallet" | "pct") => (showAll || touched.has(`${key}:${field}`) ? check.errors[key]?.[field] : undefined);
  const pctText = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");

  return (
    <>
      <PageHeader title="Split payout" description="One invoice, divided by a rule you write. Nothing moves until you approve." />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5">
          <section className="plate enter p-5 sm:p-6" style={{ ["--i" as string]: 1 }}>
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="invoice">Invoice amount (USDC)</Label>
              <Input id="invoice" inputMode="decimal" value={invoice} disabled={locked} onChange={(e) => setInvoice(e.target.value)} aria-invalid={total === null} className="h-11 font-mono text-lg tnum" />
              {total === null ? <p className="text-xs text-destructive">Enter an amount with up to 6 decimals.</p> : null}
            </div>

            <div className="mt-6" role="img" aria-label="Split proportions">
              <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                {rows.map((r, i) => (
                  <div key={r.key} className="h-full transition-[width] duration-500 ease-out-expo" style={{ width: `${check.sumBps > 0 ? ((check.bps[r.key] ?? 0) / Math.max(check.sumBps, 10_000)) * 100 : 0}%`, background: colorFor(i) }} />
                ))}
              </div>
            </div>

            <ul className="mt-5 divide-y">
              {rows.map((r, i) => {
                const part = parts?.find((p) => p.id === r.key);
                const isPrimary = r.key === primaryKey;
                return (
                  <li key={r.key} className="grid items-start gap-3 py-4 sm:grid-cols-[1fr_92px_132px]">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-3.5 size-2.5 shrink-0 rounded-full" style={{ background: colorFor(i) }} />
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <div className="flex items-center gap-2">
                          <Input aria-label={`Destination ${i + 1} name`} placeholder="Name" value={r.name} disabled={locked} onChange={(e) => edit(r.key, { name: e.target.value })} onBlur={() => touch(r.key, "name")} aria-invalid={!!err(r.key, "name")} className="h-9 text-sm font-medium" />
                          {isPrimary ? <StatusBadge tone="key">Primary</StatusBadge> : null}
                        </div>
                        {err(r.key, "name") ? <p className="text-xs text-destructive">{err(r.key, "name")}</p> : null}
                        <Input aria-label={`Destination ${i + 1} wallet address`} placeholder="Wallet address" spellCheck={false} value={r.wallet} disabled={locked} onChange={(e) => edit(r.key, { wallet: e.target.value })} onBlur={() => touch(r.key, "wallet")} aria-invalid={!!err(r.key, "wallet")} className="h-8 font-mono text-xs" />
                        {err(r.key, "wallet") ? <p className="text-xs text-destructive">{err(r.key, "wallet")}</p> : null}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {r.wallet.trim() && !check.errors[r.key]?.wallet && !isActive(r.wallet) ? <StatusBadge tone="pending">Not activated</StatusBadge> : null}
                          {!locked ? (
                            <>
                              {!isPrimary ? <button type="button" onClick={() => setPrimaryKey(r.key)} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Make primary</button> : null}
                              {rows.length > 1 ? <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove destination ${i + 1}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"><Trash2Icon className="size-3" /> Remove</button> : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <div className="relative">
                        <Input aria-label={`Destination ${i + 1} percent`} inputMode="decimal" value={r.pct} disabled={locked} onChange={(e) => edit(r.key, { pct: e.target.value })} onBlur={() => touch(r.key, "pct")} aria-invalid={!!err(r.key, "pct")} className="h-9 pr-7 text-right font-mono tnum" />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      {err(r.key, "pct") ? <p className="text-xs text-destructive">{err(r.key, "pct")}</p> : null}
                    </div>
                    <p className="pt-2 text-right font-mono text-sm tnum" key={part?.amount.toString() ?? "none"}>
                      {part ? <span className="enter-fade inline-block">{formatUsdc(part.amount)}</span> : <span className="text-muted-foreground">-</span>}
                      <span className="ml-1.5 font-sans text-xs text-muted-foreground">USDC</span>
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              {!locked ? (
                <Button variant="outline" size="sm" disabled={rows.length >= MAX_SPLIT_ROWS} onClick={addRow}><PlusIcon /> Add destination</Button>
              ) : <span />}
              <p className={cn("min-h-5 text-[13px] transition-colors duration-200", check.sumValid ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
                {check.sumValid ? "Adds up to 100%." : check.remainingBps > 0 ? `Adds up to ${pctText(check.sumBps)}%. ${pctText(check.remainingBps)}% left to assign.` : `Adds up to ${pctText(check.sumBps)}%. That is ${pctText(-check.remainingBps)}% too much.`}
              </p>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Amounts are rounded down to the smallest unit and any remainder goes to the primary recipient, so the parts add up exactly. A destination at 0% is not paid. Each destination is its own payment (about 30 seconds each), so a split is limited to {MAX_SPLIT_ROWS}.
            </p>
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
              The percentages are a policy set here, not something the chain enforces, because the program cannot read encrypted amounts. Your auditor can verify the split afterward by decrypting the payments.
            </p>
          </section>

          {v.isLive ? <OperatorPanel settings={auto} onChange={setAuto} recipients={liveItems.length || payments} locked={stage === "executing" && !halted} /> : null}

          {(stage === "executing" || stage === "done") && (
            <section className="plate enter overflow-hidden" aria-live="polite" aria-label="Split progress">
              <ul>
                {sim.rows.map((r) => (
                  <li key={r.id} className="border-b px-4 py-3.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{rowOf(r.id)?.name.trim() || "Destination"}</p>
                      <StatusBadge tone={r.status === "done" ? "verified" : r.status === "failed" ? "failed" : r.status === "running" ? "key" : "neutral"} pulse={r.status === "running"}>{r.status === "done" ? "Confirmed" : r.status === "failed" ? "Failed" : r.status === "running" ? (r.waiting ? "Waiting" : "Sending") : "Queued"}</StatusBadge>
                    </div>
                    {r.note ? <p className="mt-2 text-[13px] text-muted-foreground">{r.note}</p> : null}
                    {r.error ? <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{r.error}</p> : null}
                    <div className="mt-3"><PipelineTrack stages={PIPELINE_STAGES} completed={r.completed} status={r.status} compact /></div>
                    <div className="mt-2 min-h-5">
                      {r.status === "done" ? <p className="enter-fade font-mono text-[11.5px] text-muted-foreground">tx {r.signature?.slice(0, 10)}…{r.signature?.slice(-6)}</p> : <RunningLine stage={PIPELINE_STAGES[Math.min(r.completed, PIPELINE_STAGES.length - 1)]} active={r.status === "running"} waiting={r.waiting} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="plate enter p-5 lg:sticky lg:top-20" style={{ ["--i" as string]: 2 }}>
          <ol className="grid gap-2" aria-label="Approval status">
            {([["draft", "Draft"], ["approved", "Approved"], ["executing", "Executing"], ["done", "Done"]] as [Stage, string][]).map(([id, label], i, all) => {
              const idx = all.findIndex(([s]) => s === stage);
              const reached = i <= idx;
              return (
                <li key={id} className={cn("flex items-center gap-2.5 text-[13px] transition-colors duration-300", reached ? "text-foreground" : "text-muted-foreground")}>
                  <span className={cn("grid size-4 place-items-center rounded-full transition-colors duration-300", i < idx ? "bg-verified text-white" : i === idx ? "bg-primary" : "bg-input")}>
                    {i < idx ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : i === idx ? <span className="size-1.5 rounded-full bg-white" /> : null}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
          <div className="mt-5 grid gap-2">
            {stage === "draft" && (
              <Button className="h-10" aria-disabled={!!blocker} onClick={() => {
                if (blocker) { setShowAll(true); toast.error("This split can't be approved yet", { description: blocker }); return; }
                setStage("approved");
                toast("Split approved", { description: "You can now execute it." });
              }}>Approve split</Button>
            )}
            {stage === "approved" && (
              <>
                <Button className="h-10" onClick={() => {
                  if (!keys.requireKeys()) return;
                  if (v.isLive) {
                    if (!liveSim.canSign) { toast.error("This wallet can't sign devnet transactions", { description: "Try a different wallet." }); return; }
                  } else if (!guard()) return;
                  credited.current.clear(); recorded.current = false; setStage("executing"); sim.start();
                }}>{keys.ready ? "Execute payout" : "Unlock keys to execute"}</Button>
                <Button variant="ghost" onClick={() => setStage("draft")}>Edit rule</Button>
              </>
            )}
            {stage === "executing" && halted ? <Button className="h-10" onClick={() => liveSim.retryFailed()}>Retry failed</Button> : null}
            {stage === "executing" && !halted && <Button className="h-10" disabled>Sending…</Button>}
            {stage === "done" && <Button variant="outline" className="h-10" onClick={() => { sim.reset(); credited.current.clear(); recorded.current = false; setStage("draft"); }}>New split</Button>}
          </div>
          {stage === "draft" && blocker ? <p className="mt-3 text-[13px] leading-relaxed text-pending" role="status">{blocker}</p> : null}
          {stage === "draft" && v.vault.paused ? (
            <Button size="sm" variant="outline" className="mt-3 w-full" disabled={v.pauseBusy} onClick={() => { void (async () => { if (!v.isLive && !guard()) return; if (!(await v.setPaused(false))) return; toast("Payroll resumed", { description: "Payouts can run again." }); })(); }}>{v.pauseBusy ? "Waiting for your wallet…" : "Resume payroll"}</Button>
          ) : null}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Each destination needs an account set up to receive pay, and the treasury must cover the invoice. Both are checked before you can approve. {parts ? `This sends ${payments} payment${payments === 1 ? "" : "s"}.` : ""}</p>
        </aside>
      </div>
    </>
  );
}
