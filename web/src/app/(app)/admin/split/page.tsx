"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Address } from "@/components/crypto/fingerprint";
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
import { BPS_TOTAL, splitAmount, type SplitDestination } from "@/lib/payroll/split";
import { checkSplitWallets, splitRunItems } from "@/lib/payroll/split-plan";
import { useLiveRun, type RunSettings } from "@/lib/payroll/use-live-run";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { cn } from "@/lib/utils";

const COLORS = { sam: "var(--primary)", tax: "var(--verified)", fee: "oklch(0.72 0.14 75)" };
const SPLIT_IDS = ["sam", "tax", "fee"];

type Stage = "draft" | "approved" | "executing" | "done";

export default function SplitPage() {
  return (
    <PayrollGate title="Split payout">
      <Split />
    </PayrollGate>
  );
}

function Split() {
  const v = useVault();
  const primary = v.vault.employees[0];
  if (!primary) {
    return (
      <>
        <PageHeader title="Split payout" description="One invoice, divided by a rule. Nothing moves until you approve." />
        <section className="plate enter mx-auto max-w-xl p-8 text-center">
          <p className="text-[15px] font-medium">Add the primary recipient first.</p>
          <p className="mt-1 text-sm text-muted-foreground">A split pays one person plus the other destinations you choose. Add that person to your payroll list.</p>
          <Link href="/admin/employees" className={cn(buttonVariants(), "mt-5 h-10 px-5")}>Add employees</Link>
        </section>
      </>
    );
  }
  return <SplitBody primary={primary} />;
}

function SplitBody({ primary }: { primary: { name: string; wallet: string } }) {
  const keys = useKeys();
  const guard = useLiveGuard();
  const v = useVault();
  // Demo wallets split between fixed demo wallets. Real wallets enter where the tax and fee shares go: any wallet that has set up its account.
  const [taxWallet, setTaxWallet] = useState("");
  const [feeWallet, setFeeWallet] = useState("");
  const [extraActive, setExtraActive] = useState<Record<string, boolean>>({});
  const DEST_META: Record<string, { name: string; wallet: string; color: string }> = {
    sam: { name: primary.name, wallet: primary.wallet, color: COLORS.sam },
    tax: { name: v.isLive ? "Tax reserve" : `${v.vault.name} tax reserve`, wallet: v.isLive ? taxWallet.trim() : TAX_WALLET, color: COLORS.tax },
    fee: { name: v.isLive ? "Platform fee" : "Platform fee (demo wallet)", wallet: v.isLive ? feeWallet.trim() : FEE_WALLET, color: COLORS.fee },
  };
  const targets = SPLIT_IDS.map((k) => ({ id: k, name: DEST_META[k].name, wallet: DEST_META[k].wallet }));
  const walletErrors = v.isLive ? checkSplitWallets(targets) : {};
  // The payroll list's activation is already read by the chain provider; the two typed-in wallets are read here.
  const extraKey = v.isLive ? [taxWallet, feeWallet].map((w) => w.trim()).filter((w, i) => w && !walletErrors[["tax", "fee"][i]]).join("|") : "";
  useEffect(() => {
    if (!extraKey) return;
    let cancelled = false;
    const wallets = extraKey.split("|").map((w) => address(w));
    readActivation(rpc, wallets).then((a) => { if (!cancelled) setExtraActive((prev) => ({ ...prev, ...a })); }, () => undefined);
    return () => { cancelled = true; };
  }, [extraKey]);
  const isActive = (wallet: string) => (v.isLive && wallet !== primary.wallet ? !!extraActive[wallet] : v.isActivated(wallet));
  const allActivated = SPLIT_IDS.every((k) => isActive(DEST_META[k].wallet)) && SPLIT_IDS.every((k) => !walletErrors[k]);
  const [auto, setAuto] = useState<AutoPayrollSettings>(DEFAULT_AUTO_SETTINGS);
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);
  const [invoice, setInvoice] = useState("10,000");
  const [pct, setPct] = useState({ sam: "79", tax: "20", fee: "1" });
  const [stageState, setStage] = useState<Stage>("draft");

  const total = parseUsdc(invoice);
  const bps = { sam: Math.round(Number(pct.sam) * 100), tax: Math.round(Number(pct.tax) * 100), fee: Math.round(Number(pct.fee) * 100) };
  const sum = bps.sam + bps.tax + bps.fee;
  const sumValid = [pct.sam, pct.tax, pct.fee].every((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) && sum === BPS_TOTAL;
  const dests: SplitDestination[] = [
    { id: "sam", label: DEST_META.sam.name, bps: bps.sam, primary: true },
    { id: "tax", label: DEST_META.tax.name, bps: bps.tax },
    { id: "fee", label: DEST_META.fee.name, bps: bps.fee },
  ];
  const parts = useMemo(() => {
    if (total === null || total <= 0n || !sumValid) return null;
    try { return splitAmount(total, dests); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, sumValid, pct.sam, pct.tax, pct.fee]);

  const mockSim = useRunSimulation(SPLIT_IDS, PIPELINE_STAGES.length, TRANSFER_STAGE);
  const liveItems = useMemo(() => (parts && v.isLive ? splitRunItems(parts, targets) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parts, v.isLive, taxWallet, feeWallet, primary.wallet, primary.name]);
  const maxPayments = Math.max(auto.maxPayments ?? liveItems.length, liveItems.length);
  const runSettings = useMemo<RunSettings>(() => (auto.enabled ? { mode: "automatic", terms: { ttlSeconds: auto.ttlSeconds, maxPayments } } : { mode: "manual" }), [auto.enabled, auto.ttlSeconds, maxPayments]);
  const liveSim = useLiveRun(liveItems, PIPELINE_STAGES.length, runSettings);
  const sim = v.isLive ? liveSim : mockSim;
  const stage: Stage = stageState === "executing" && sim.done ? "done" : stageState;
  const halted = stage === "executing" && !sim.running && sim.failedCount > 0;
  // Each destination is credited the moment its transfer confirms.
  useEffect(() => {
    for (const r of sim.rows) {
      if (r.status !== "done" || !r.signature || credited.current.has(r.id)) continue;
      credited.current.add(r.id);
      const part = parts?.find((p) => p.id === r.id);
      if (part && !v.isLive) v.pay(DEST_META[r.id].wallet, part.amount, r.signature, `${v.vault.name} split payout`);
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
      items: paid.map((p) => ({ wallet: DEST_META[p.id].wallet, name: DEST_META[p.id].name, amount: p.amount, signature: sim.rows.find((r) => r.id === p.id)?.signature ?? "" })),
    }).catch((e) => toast.error("Payout sent, but the run couldn't be saved to your history", { description: e instanceof Error ? e.message : "The payments are on-chain and unaffected." }));
    toast.success("Split payout complete", { description: `${paid.length} confidential transfer${paid.length === 1 ? "" : "s"} sent.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const locked = stage !== "draft";
  const treasuryKnown = !v.isLive || v.treasuryStatus === "ready"; // a real treasury balance is only readable while keys are unlocked
  const treasuryOk = !!parts && treasuryKnown && v.vault.treasury >= parts.reduce((n, p) => n + p.amount, 0n);
  const canApprove = !!parts && allActivated && !v.vault.paused && treasuryOk;

  return (
    <>
      <PageHeader title="Split payout" description="One invoice, divided by a rule. Nothing moves until you approve." />
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
                {(["sam", "tax", "fee"] as const).map((k) => (
                  <div key={k} className="h-full transition-[width] duration-500 ease-out-expo" style={{ width: `${sumValid ? bps[k] / 100 : 0}%`, background: DEST_META[k].color }} />
                ))}
              </div>
            </div>

            <ul className="mt-5 divide-y">
              {(["sam", "tax", "fee"] as const).map((k, i) => {
                const part = parts?.find((p) => p.id === k);
                return (
                  <li key={k} className="grid items-center gap-3 py-3.5 sm:grid-cols-[1fr_92px_150px]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: DEST_META[k].color }} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">{DEST_META[k].name}{k === "sam" ? <StatusBadge tone="key">Primary</StatusBadge> : null}</p>
                        {v.isLive && k !== "sam" ? (
                          <div className="mt-1.5 grid gap-1">
                            <Input aria-label={`${DEST_META[k].name} wallet address`} placeholder="Wallet address" spellCheck={false} value={k === "tax" ? taxWallet : feeWallet} disabled={locked} onChange={(e) => (k === "tax" ? setTaxWallet : setFeeWallet)(e.target.value)} aria-invalid={!!walletErrors[k] && DEST_META[k].wallet !== ""} className="h-8 font-mono text-xs" />
                            {walletErrors[k] && DEST_META[k].wallet !== "" ? <p className="text-xs text-destructive">{walletErrors[k]}</p> : null}
                            {!walletErrors[k] ? (isActive(DEST_META[k].wallet) ? null : <StatusBadge tone="pending">Not activated</StatusBadge>) : null}
                          </div>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <Address value={DEST_META[k].wallet} className="text-muted-foreground" />
                            {!isActive(DEST_META[k].wallet) ? <StatusBadge tone="pending">Not activated</StatusBadge> : null}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <Input aria-label={`${DEST_META[k].name} percent`} inputMode="decimal" value={pct[k]} disabled={locked} onChange={(e) => setPct((p) => ({ ...p, [k]: e.target.value }))} className="h-9 pr-7 text-right font-mono tnum" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-right font-mono text-sm tnum" key={part?.amount.toString() ?? "none"}>
                      {part ? <span className="enter-fade inline-block">{formatUsdc(part.amount)}</span> : <span className="text-muted-foreground">-</span>}
                      <span className="ml-1.5 font-sans text-xs text-muted-foreground">USDC</span>
                    </p>
                    <span className="sr-only">{i}</span>
                  </li>
                );
              })}
            </ul>
            <p className={cn("mt-2 min-h-5 text-[13px] transition-colors duration-200", sumValid ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
              {sumValid ? "Rounded in base units. Any remainder goes to the primary recipient so the parts add up exactly." : `Percentages add up to ${(sum / 100).toFixed(2).replace(/\.00$/, "")}%. They must total 100%.`}
            </p>
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
              The percentages are a policy set here, not something the chain enforces, because the program cannot read encrypted amounts. Your auditor can verify the split afterward by decrypting all three payments.
            </p>
          </section>

          {stage === "draft" && v.vault.paused ? (
            <div className="plate flex flex-wrap items-center justify-between gap-3 border-pending/25 bg-pending-soft p-4 text-[13.5px] text-pending" role="alert">
              <p>Payroll is paused, so payouts would be rejected. Resume it to continue.</p>
              <Button size="sm" variant="outline" disabled={v.pauseBusy} onClick={() => { void (async () => { if (!v.isLive && !guard()) return; if (!(await v.setPaused(false))) return; toast("Payroll resumed", { description: "Payouts can run again." }); })(); }}>{v.pauseBusy ? "Waiting for your wallet…" : "Resume payroll"}</Button>
            </div>
          ) : null}
          {stage === "draft" && parts && v.isLive && !treasuryKnown ? (
            <p className="plate border-pending/25 bg-pending-soft p-4 text-[13.5px] text-pending" role="alert">Unlock your keys so the app can check that the treasury covers this invoice.</p>
          ) : null}
          {stage === "draft" && parts && treasuryKnown && !treasuryOk ? (
            <p className="plate border-pending/25 bg-pending-soft p-4 text-[13.5px] text-pending" role="alert">The treasury holds {formatUsdc(v.vault.treasury)} USDC, which does not cover this invoice. Fund the treasury first.</p>
          ) : null}
          {v.isLive ? <OperatorPanel settings={auto} onChange={setAuto} recipients={liveItems.length} locked={stage === "executing" && !halted} /> : null}
          {(stage === "executing" || stage === "done") && (
            <section className="plate enter overflow-hidden" aria-live="polite" aria-label="Split progress">
              <ul>
                {sim.rows.map((r) => (
                  <li key={r.id} className="border-b px-4 py-3.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{DEST_META[r.id].name}</p>
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
              <Button className="h-10" disabled={!canApprove} onClick={() => { setStage("approved"); toast("Split approved", { description: "You can now execute it." }); }}>Approve split</Button>
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
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Each destination needs an activated account, and the treasury must cover the invoice. Both are checked before you can approve.</p>
        </aside>
      </div>
    </>
  );
}
