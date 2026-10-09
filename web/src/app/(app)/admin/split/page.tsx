"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LockIcon, PlayIcon, RefreshCwIcon, SearchIcon, SendIcon, SplitIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Address } from "@/components/crypto/fingerprint";
import { useKeys } from "@/components/crypto/key-context";
import { Flow } from "@/components/crypto/flow";
import { PayrollGate } from "@/components/data/payroll-gate";
import { useOperator } from "@/components/app/operator-context";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { useAccountStatus } from "@/components/app/employee-context";
import { EmptyState } from "@/components/app/empty-state";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import {
  LaneMark,
  PhaseRail,
  PreflightBand,
  RecipientBar,
  RetryFailedAlert,
  Reveal,
  SignaturePrompt,
  SigningCard,
  STAGE_LABEL,
  StartOverButton,
  TxSlot,
  laneDetail,
  laneStatus,
  laneSteps,
  runFlow,
  runStatus,
  usePreflight,
  type Check,
  type Fix,
  type RunPhase,
} from "@/components/app/run-payroll-parts";
import { PIPELINE_STAGES, TRANSFER_STAGE } from "@/lib/mock/data";
import { shortToday } from "@/lib/mock/store";
import { formatUsdc, parseUsdc, shortAddress } from "@/lib/format";
import { BPS_TOTAL, splitAmount } from "@/lib/payroll/split";
import { checkSplit, MAX_SPLIT_ROWS, splitRunItems, toDestinations, type SplitRow } from "@/lib/payroll/split-plan";
import { useLiveRun } from "@/lib/payroll/use-live-run";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { checkSigning, suggestSigning, type SigningState } from "@/lib/payroll/signing-check";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

/** Rent for the temporary proof accounts plus fees. The rent is refunded when they are closed. */
const MIN_SOL_FOR_RUN = 15_000_000n;
/** A search box appears above the address list from this many saved addresses. */
const SEARCH_FROM = 7;

const pctText = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");

/** Column widths shared by the header strip and every row, so share and amount line up down the list. */
const COL_SHARE = "w-[5.25rem]";
const COL_AMOUNT = "w-28";

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
  const account = useAccountStatus();
  const saved = v.vault.employees;

  // The split is built from saved addresses: tick one to include it, then give it a share. The first one ticked is the primary.
  const [picked, setPicked] = useState<string[]>(() => (saved[0] ? [saved[0].id] : []));
  const [pcts, setPcts] = useState<Record<string, string>>(() => (saved[0] ? { [saved[0].id]: "100" } : {}));
  const [primaryId, setPrimaryId] = useState<string>(() => saved[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const [invoice, setInvoice] = useState("10,000");
  const [phaseState, setPhase] = useState<RunPhase>("review");
  const [failDemo, setFailDemo] = useState(false);
  const preflight = usePreflight();
  const { checks, allPass } = preflight;
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);

  const { runSettings, live: autoLive, setModalOpen, secondsLeft: autoSecondsLeft, status: autoStatus, settings: autoSettings, setSettings: setAutoSettings } = useOperator();
  // How the run would be signed right now. Read through a ref by the checks, which run from timers and callbacks.
  const signingNow: SigningState = autoLive && autoStatus ? { mode: "automatic", secondsLeft: autoSecondsLeft, paymentsLeft: autoStatus.paymentsLeft } : { mode: "manual" };
  const signingRef = useRef(signingNow);
  useEffect(() => {
    signingRef.current = signingNow;
  });

  // A saved address deleted elsewhere drops out of the split.
  const rows = useMemo<SplitRow[]>(
    () => picked.flatMap((id) => saved.filter((a) => a.id === id).map((a) => ({ key: a.id, name: a.name, wallet: a.wallet, pct: pcts[id] ?? "" }))),
    [picked, saved, pcts],
  );
  const primaryKey = rows.some((r) => r.key === primaryId) ? primaryId : (rows[0]?.key ?? "");
  const check = useMemo(() => checkSplit(rows, primaryKey, { validateAddresses: v.isLive }), [rows, primaryKey, v.isLive]);
  const total = parseUsdc(invoice);
  const parts = useMemo(() => {
    if (total === null || total <= 0n || !check.ok) return null;
    try {
      return splitAmount(total, toDestinations(rows, check.bps, primaryKey));
    } catch {
      return null;
    }
  }, [total, check, rows, primaryKey]);
  const rowOf = (key: string) => rows.find((r) => r.key === key);
  const partOf = (key: string) => parts?.find((p) => p.id === key);

  const editing = phaseState === "review";
  const full = picked.length >= MAX_SPLIT_ROWS;

  /** Tick: include it with whatever share is still unassigned (all of it for the first). Untick: drop it; the primary moves to the next one. */
  const toggle = (id: string, on: boolean) => {
    if (!editing) return;
    if (on) {
      if (full || picked.includes(id)) return;
      setPicked((p) => [...p, id]);
      setPcts((m) => ({ ...m, [id]: rows.length === 0 ? "100" : pctText(Math.max(0, check.remainingBps)) }));
      if (rows.length === 0) setPrimaryId(id);
    } else {
      setPicked((p) => p.filter((x) => x !== id));
      if (id === primaryKey) setPrimaryId(picked.find((x) => x !== id) ?? "");
    }
  };

  /** Equal shares in basis points; the primary takes the odd basis points so the rule is exactly 100%. */
  const splitEvenly = () => {
    if (!rows.length) return;
    const base = Math.floor(BPS_TOTAL / rows.length);
    const rest = BPS_TOTAL - base * rows.length;
    setPcts((m) => ({ ...m, ...Object.fromEntries(rows.map((r) => [r.key, pctText(base + (r.key === primaryKey ? rest : 0))])) }));
  };

  // Only destinations with something to pay become payments; a 0% destination is left out of the run.
  const paying = useMemo(() => rows.filter((r) => (check.bps[r.key] ?? 0) > 0), [rows, check.bps]);
  const targets = useMemo(() => rows.map((r) => ({ id: r.key, name: r.name, wallet: r.wallet })), [rows]);
  const demoIds = useMemo(() => paying.map((r) => r.key), [paying]);
  const mockSim = useRunSimulation(demoIds, PIPELINE_STAGES.length, TRANSFER_STAGE);
  const liveItems = useMemo(() => (parts && v.isLive ? splitRunItems(parts, targets) : []), [parts, v.isLive, targets]);
  const liveSim = useLiveRun(liveItems, PIPELINE_STAGES.length, runSettings);
  const sim = v.isLive ? liveSim : mockSim;
  const phase: RunPhase = phaseState === "executing" && sim.done ? "done" : phaseState;
  const halted = phase === "executing" && !sim.running && sim.failedCount > 0;
  const { status, tone: statusTone, label: statusLabel } = runStatus(phase, halted, allPass, preflight.failed);
  const flow = runFlow(status);
  const executing = phase === "executing" || phase === "done";

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
    if (phase !== "done" || recorded.current || !parts) return;
    recorded.current = true;
    const paid = parts.filter((p) => sim.rows.some((r) => r.id === p.id && r.signature));
    const sum = paid.reduce((n, p) => n + p.amount, 0n);
    v.recordRun({
      id: `run-${Date.now()}`,
      // No amount in the label: labels are stored in plaintext and shown to every recipient, while amounts are sealed.
      label: "Split payout",
      date: shortToday(),
      status: "done",
      recipients: paid.length,
      total: sum,
      items: paid.map((p) => {
        const r = sim.rows.find((x) => x.id === p.id);
        return { wallet: rowOf(p.id)!.wallet, name: rowOf(p.id)!.name, amount: p.amount, signature: r?.signature ?? "", receivedAmount: r?.receivedAmount };
      }),
    }).catch((e) => toast.error("Payout sent, but the run couldn't be saved to your history", { description: e instanceof Error ? e.message : "The payments are on-chain and unaffected." }));
    toast.success("Split payout complete", { description: `${paid.length} payment${paid.length === 1 ? "" : "s"} sent. Amounts stayed encrypted.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (halted) toast.error(`${sim.failedCount} payment${sim.failedCount === 1 ? "" : "s"} failed`, { description: "Confirmed payments are safe. Retry the rest from the summary panel." });
  }, [halted, sim.failedCount]);

  /** What stops the rule itself from being run, in words. Shown in place (the fields light up) when Simulate is pressed. */
  const ruleProblem: string | null = (() => {
    if (rows.length === 0) return "Tick at least one saved address.";
    if (total === null || total <= 0n) return "Enter a valid invoice amount.";
    if (!check.sumValid) return check.remainingBps > 0 ? `${pctText(check.remainingBps)}% of the invoice is not assigned yet.` : `The shares add up to ${pctText(-check.remainingBps)}% more than 100%.`;
    const bad = rows.find((r) => check.errors[r.key]);
    if (bad) return `${bad.name}: ${Object.values(check.errors[bad.key])[0]}`;
    return null;
  })();

  const buildChecks = (paused: boolean): Omit<Check, "state">[] => {
    const sum = parts?.reduce((n, p) => n + p.amount, 0n) ?? 0n;
    const missing = paying.filter((r) => !v.isActivated(r.wallet));
    const covered = v.vault.treasury >= sum;
    return [
      { id: "auth", label: "Connected wallet is the vault admin", ok: true, detail: `${shortAddress(v.admin)} is the authorized vault authority` },
      { id: "sum", label: "The parts add up to the invoice", ok: !!parts && sum === total, detail: `${paying.length} part${paying.length === 1 ? "" : "s"} total ${formatUsdc(sum)} USDC. ${rowOf(primaryKey)?.name ?? "The primary"} takes any rounding remainder.` },
      { id: "cov", label: "Treasury covers the invoice", ok: covered, detail: covered ? `${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed` : `Only ${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed. Fund treasury first.` },
      {
        id: "act",
        label: "Every destination has an activated confidential account",
        ok: missing.length === 0,
        detail: missing.length === 0 ? `${paying.length} of ${paying.length} destinations active` : `${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "has" : "have"} not activated an account. Leaving one out would change the split.`,
      },
      ...(v.isLive
        ? [
            { id: "sol", label: "Sufficient SOL for rent & gas fees", ok: account.sol >= MIN_SOL_FOR_RUN, detail: account.sol >= MIN_SOL_FOR_RUN ? `${(Number(account.sol) / 1e9).toFixed(3)} SOL available in admin wallet` : `Each payment requires temporary proof account rent. Available: ${(Number(account.sol) / 1e9).toFixed(3)} SOL.` },
            // Automatic payroll stops part way if its payment count or time runs out, so check both against this run.
            ...checkSigning(signingRef.current, paying.length).map((c) => ({ ...c, fix: c.ok ? undefined : ({ kind: "operator", label: "Adjust automatic payroll" } as Fix) })),
          ]
        : []),
      { id: "pause", label: "Payroll vault is active", ok: !paused, detail: paused ? "Payroll is paused; pay_employee instruction would revert" : "Vault active and accepting payouts", fix: paused ? { kind: "resume" } : undefined },
    ];
  };

  const runSimulation = (paused = v.vault.paused) => {
    if (ruleProblem) {
      setShowAll(true);
      toast.error("This split can't run yet", { description: ruleProblem });
      return;
    }
    if (!keys.requireKeys()) return;
    if (v.isLive && v.treasuryStatus !== "ready") {
      toast(v.treasuryStatus === "error" ? "Couldn't read treasury balance" : "Decrypting treasury balance", { description: v.treasuryError ?? "Please try again in a moment." });
      return;
    }
    setPhase("simulating");
    preflight.run(buildChecks(paused), () => setPhase("simulated"));
  };

  // The authorization changed while the split waits for approval: the signing checks are out of date, so run them again.
  const authKey = autoLive && autoStatus ? `${autoStatus.expiresAt}:${autoStatus.paymentsLeft}` : "manual";
  const lastAuthKey = useRef(authKey);
  useEffect(() => {
    if (lastAuthKey.current === authKey) return;
    lastAuthKey.current = authKey;
    if (!v.isLive || phaseState !== "simulated") return;
    const t = setTimeout(() => runSimulation(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  const applyFix = (fix: Fix) => {
    if (fix.kind === "operator") {
      // Prefill the smallest settings that cover this run; the dialog asks to turn the current authorization off and on again.
      const s = suggestSigning(paying.length);
      setAutoSettings({ ...autoSettings, ttlSeconds: s.ttlSeconds ?? autoSettings.ttlSeconds, maxPayments: Math.max(s.maxPayments, autoSettings.maxPayments ?? 0) });
      setModalOpen(true);
      return;
    }
    if (fix.kind === "resume") {
      void (async () => {
        if (!v.isLive && !guard()) return;
        if (!(await v.setPaused(false))) return;
        toast("Payroll resumed", { description: "Payouts can run again." });
        runSimulation(false);
      })();
    }
  };

  const approveAndRun = () => {
    credited.current.clear();
    recorded.current = false;
    if (v.isLive) {
      if (!keys.requireKeys()) return;
      // Time has passed since the checks ran (and the authorization may have changed): check signing again right before sending.
      const stale = checkSigning(signingRef.current, paying.length).find((c) => !c.ok);
      if (stale) {
        toast.error("This split would stop part way", { description: stale.detail });
        runSimulation();
        return;
      }
      if (!liveSim.canSign) {
        toast.error("This wallet can't sign devnet transactions", { description: "Try a different wallet." });
        return;
      }
      setPhase("executing");
      liveSim.start();
      return;
    }
    setPhase("executing");
    const target = paying[Math.min(1, paying.length - 1)];
    mockSim.start(failDemo && target ? { [target.key]: TRANSFER_STAGE } : {});
  };

  /** Back to editing the rule, as it was. */
  const reset = () => {
    preflight.reset();
    setPhase("review");
    sim.reset();
  };

  const nameOf = (id: string) => rowOf(id)?.name ?? "Destination";
  const rowRun = (id: string) => sim.rows.find((r) => r.id === id);
  const paidCount = sim.rows.filter((r) => r.status === "done").length;
  const current = sim.rows.find((r) => r.status === "running");
  const signing = sim.rows.some((r) => r.deadline);
  // Safe only while no payment has gone out (see Run payroll): after that, Retry failed is the way on.
  const canStartOver = phase === "simulating" || phase === "simulated" || (halted && paidCount === 0 && !sim.rows.some((r) => r.uncertain));
  const pctError = (key: string) => (showAll || touched.has(key) ? check.errors[key]?.pct : undefined);
  const invoiceError = (showAll || touched.has("invoice")) && (total === null || total <= 0n);

  const q = query.trim().toLowerCase();
  // While editing: every saved address (filtered by the search). Once the checks start: only the ones in the split, in the order picked.
  const listed = editing ? (q ? saved.filter((a) => a.name.toLowerCase().includes(q) || a.wallet.toLowerCase().includes(q)) : saved) : rows.map((r) => saved.find((a) => a.id === r.key)!);

  const progress: ButtonProgress | null =
    phase === "simulating"
      ? { label: `Checking ${Math.min(preflight.done + 1, checks.length)} of ${checks.length}…`, fill: checks.length ? (preflight.done / checks.length) * 100 : 5 }
      : phase === "executing" && !halted
        ? { label: signing ? "Approve in wallet" : current ? `Paying ${paidCount + 1} of ${sim.rows.length} · ${STAGE_LABEL[Math.min(current.completed, STAGE_LABEL.length - 1)]}` : "Starting…", fill: Math.max(4, sim.progress * 100) }
        : phase === "done"
          ? { label: `Split sent · ${paidCount} paid`, fill: 100, done: true }
          : null;

  const action =
    phase === "review"
      ? { label: keys.ready ? "Simulate split" : "Unlock keys & simulate", icon: <PlayIcon className="size-3.5 fill-current" />, onClick: () => runSimulation(), disabled: false }
      : phase === "simulated" && allPass
        ? { label: "Approve & run split", icon: <SendIcon className="size-3.5" />, onClick: approveAndRun, disabled: false }
        : phase === "simulated"
          ? { label: "Run checks again", icon: <RefreshCwIcon className="size-3.5" />, onClick: () => runSimulation(), disabled: false }
          : halted
            ? { label: `Retry ${sim.failedCount} failed`, icon: <RefreshCwIcon className="size-3.5" />, onClick: sim.retryFailed, disabled: false }
            : { label: "", icon: null, onClick: () => {}, disabled: true };

  // How full the rule is: one segment per destination (the primary in key indigo), the unassigned rest as a dashed "not yet" slot.
  const over = check.sumBps > BPS_TOTAL;
  const scale = Math.max(check.sumBps, BPS_TOTAL);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Split Payout"
        description="Divide one invoice between your saved addresses by percentage, then send each part as an encrypted transfer."
        actions={
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3.5 text-xs font-medium")}>
            Back to vault
          </Link>
        }
      />

      {saved.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="Save an address to split to"
          description="A split divides an invoice between people in your address book. Add the wallets you pay first, then come back to set their shares."
          action={
            <Link href="/admin/addresses" className={cn(buttonVariants(), "h-9 px-4 text-xs")}>
              Saved Addresses
            </Link>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          {/* The rule: the same rows from editing to done. Executing opens each destination into its live payment lane. */}
          <section className="plate enter relative overflow-hidden" style={{ ["--i" as string]: 2 }} aria-labelledby="split-heading">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/5 blur-3xl" aria-hidden />

            <div className="relative flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <SplitIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <h2 id="split-heading" className="truncate text-sm font-semibold tracking-tight text-foreground">
                    Split rule
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {executing ? `${paidCount} of ${sim.rows.length} paid · one transfer at a time` : `${rows.length} destination${rows.length === 1 ? "" : "s"} · ${check.sumValid ? "adds up to 100%" : `${pctText(check.sumBps)}% assigned`}`}
                  </p>
                </div>
              </div>
              <StatusBadge tone={statusTone} pulse={status === "executing" && !halted}>
                {statusLabel}
              </StatusBadge>
            </div>

            <div className="relative mt-5 border-t border-border/60">
              {/* The invoice and how full the rule is. Folds away once the checks start. */}
              <Reveal open={editing}>
                <div className="grid gap-x-6 gap-y-4 border-b border-border/60 bg-muted/20 px-5 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-end sm:px-6">
                  <div className="grid gap-1.5">
                    <label htmlFor="invoice" className="flex h-4 items-center gap-1.5 text-xs font-semibold text-foreground">
                      Invoice amount
                      <InfoTooltip content="The total to divide. Each part is rounded down to the smallest unit; the primary destination takes what is left so the parts add up exactly." />
                    </label>
                    <div className="relative">
                      <Input
                        id="invoice"
                        inputMode="decimal"
                        value={invoice}
                        onChange={(e) => setInvoice(e.target.value)}
                        onBlur={() => touch("invoice")}
                        aria-invalid={invoiceError}
                        className="h-10 bg-card pr-14 font-mono text-base font-semibold tnum"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">USDC</span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex h-4 items-center justify-between gap-3 text-[11px]">
                      <span className="font-medium text-muted-foreground">Assigned</span>
                      <span className={cn("font-medium tnum", check.sumValid ? "text-verified" : rows.length ? "text-pending" : "text-muted-foreground")} aria-live="polite">
                        {check.sumValid ? "100% · ready" : check.remainingBps > 0 ? `${pctText(check.remainingBps)}% left to assign` : `${pctText(-check.remainingBps)}% over 100%`}
                      </span>
                    </div>
                    {/* Same height as the invoice field, so the two columns sit on one baseline. */}
                    <div className="flex items-center sm:h-10">
                      <div className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full", over && "ring-1 ring-destructive/40")} role="img" aria-label={`${pctText(check.sumBps)}% of the invoice assigned`}>
                        {rows.map((r) =>
                          (check.bps[r.key] ?? 0) > 0 ? (
                            <span
                              key={r.key}
                              title={`${r.name} · ${pctText(check.bps[r.key])}%`}
                              className={cn("h-full rounded-full transition-[width] duration-500 ease-out-expo", over ? "bg-destructive/60" : r.key === primaryKey ? "bg-primary" : "bg-primary/35")}
                              style={{ width: `${(check.bps[r.key] / scale) * 100}%` }}
                            />
                          ) : null,
                        )}
                        {check.remainingBps > 0 ? <span className="h-full flex-1 rounded-full border border-dashed border-input" /> : null}
                      </div>
                    </div>
                  </div>
                  {invoiceError ? <p className="-mt-2 text-xs text-destructive sm:col-span-2">Enter an amount above 0 with up to 6 decimals.</p> : null}
                </div>
              </Reveal>

              <PreflightBand checks={checks} phase={phase} allPass={allPass} onFix={applyFix} />

              <SignaturePrompt rows={executing ? sim.rows : []} nameOf={nameOf} />

              {halted ? <RetryFailedAlert count={sim.failedCount} onRetry={sim.retryFailed} /> : null}

              <Reveal open={editing && saved.length >= SEARCH_FROM}>
                <div className="px-5 pt-4 sm:px-6">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or address" aria-label="Search saved addresses" className="h-8 bg-card pl-8 text-xs" />
                  </div>
                </div>
              </Reveal>

              {/* Header strip: the same columns as the rows below. */}
              <div className={cn("flex h-9 items-center gap-3 border-border/60 bg-muted/30 px-5 sm:px-6", editing ? (saved.length >= SEARCH_FROM ? "mt-3 border-y" : "border-b") : "mt-4 border-y")}>
                <span className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="truncate">{editing ? `Saved addresses · ${picked.length} of ${saved.length} picked` : "Destination"}</span>
                  {editing && rows.length > 1 ? (
                    <button type="button" onClick={splitEvenly} className="shrink-0 font-semibold text-primary hover:underline">
                      Split evenly
                    </button>
                  ) : null}
                </span>
                <span className={cn(COL_SHARE, "shrink-0 text-right text-[11px] font-medium text-muted-foreground", editing ? "block" : "hidden sm:block")}>Share</span>
                <span className={cn(COL_AMOUNT, "shrink-0 text-right text-[11px] font-medium text-muted-foreground", editing ? "hidden sm:block" : "block")}>Amount (USDC)</span>
              </div>

              <ul aria-live="polite" aria-label="Destinations">
                {listed.map((a) => {
                  const on = picked.includes(a.id);
                  const bps = check.bps[a.id] ?? 0;
                  const part = partOf(a.id);
                  const isPrimary = on && a.id === primaryKey;
                  const run = rowRun(a.id);
                  const running = executing && run?.status === "running";
                  const failed = executing && run?.status === "failed";
                  const paid = executing && run?.status === "done";
                  const activated = v.isActivated(a.wallet);
                  const error = on && editing ? pctError(a.id) : undefined;
                  const amount = part ? formatUsdc(part.amount) : "–";
                  // A 0% destination has nothing to pay, so it folds away once the run starts.
                  return (
                    <li key={a.id}>
                      <Reveal open={!executing || bps > 0}>
                        <div
                          className={cn(
                            "group border-b border-border/60 px-5 py-3 transition-[background-color,opacity] duration-500 sm:px-6",
                            !executing && "row-hover",
                            editing && on && "bg-accent/20",
                            !editing && !executing && bps === 0 && "opacity-45",
                            running && "bg-accent/35",
                            failed && "bg-failed-soft/50",
                          )}
                        >
                          <div className="flex min-h-10 items-center gap-3">
                            {executing ? (
                              <LaneMark status={run?.status ?? "pending"} />
                            ) : (
                              <Checkbox checked={on} onCheckedChange={(c) => toggle(a.id, !!c)} disabled={!editing || (!on && full)} aria-label={`Include ${a.name} in the split`} />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                                {isPrimary ? (
                                  <StatusBadge tone="key" className="shrink-0 text-[10.5px]">
                                    Primary
                                  </StatusBadge>
                                ) : on && editing ? (
                                  <button
                                    type="button"
                                    onClick={() => setPrimaryId(a.id)}
                                    className="shrink-0 rounded-full border border-border/80 bg-card px-2 py-px text-[10.5px] font-medium text-muted-foreground opacity-0 transition-opacity duration-150 hover:border-primary/30 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                                  >
                                    Make primary
                                  </button>
                                ) : null}
                                {!activated && !executing ? (
                                  <StatusBadge tone="pending" className="shrink-0 text-[10.5px]">
                                    Not activated
                                  </StatusBadge>
                                ) : null}
                              </div>
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Address value={a.wallet} />
                                {/* Phones: the amount column is hidden while editing, so the part rides on this line. */}
                                {editing && on ? <span className="font-mono tnum sm:hidden">· {amount}</span> : null}
                              </p>
                            </div>

                            {on ? (
                              <>
                                <div className={cn(COL_SHARE, "shrink-0", editing ? "block" : "hidden self-start sm:block")}>
                                  {editing ? (
                                    <label className="enter-fade relative block">
                                      <span className="sr-only">Share for {a.name}, in percent</span>
                                      <Input
                                        autoFocus={rows.length > 1 && a.id === picked[picked.length - 1]}
                                        inputMode="decimal"
                                        value={pcts[a.id] ?? ""}
                                        placeholder="0"
                                        onChange={(e) => setPcts((m) => ({ ...m, [a.id]: e.target.value }))}
                                        onBlur={() => touch(a.id)}
                                        aria-invalid={!!error}
                                        className="h-9 bg-card pr-6 text-right font-mono text-sm tnum"
                                      />
                                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                    </label>
                                  ) : (
                                    <p className="text-right font-mono text-sm text-muted-foreground tnum">{pctText(bps)}%</p>
                                  )}
                                </div>
                                <div className={cn(COL_AMOUNT, "shrink-0 text-right", editing ? "hidden sm:block" : "self-start")}>
                                  <p className={cn("font-mono text-sm font-semibold tnum", part ? "text-foreground" : "text-muted-foreground")}>{amount}</p>
                                  {executing ? <p className={cn("mt-0.5 text-[11px] font-medium", laneStatus(run).className)}>{laneStatus(run).text}</p> : null}
                                </div>
                              </>
                            ) : null}
                          </div>

                          {error ? <p className="pl-7 pt-1.5 text-[11px] text-destructive">{error}</p> : null}

                          {/* Only the lane that is working (or stopped) opens; queued and paid ones stay one line. */}
                          <Reveal open={executing && (running || failed)}>
                            <div className="pt-4 sm:pl-9">
                              <Flow label={`Payment to ${a.name}`} steps={laneSteps(run)} />
                              <p className={cn("mt-3 text-xs", failed ? "text-destructive" : run?.deadline ? "text-primary" : "text-muted-foreground")}>{laneDetail(run)}</p>
                            </div>
                          </Reveal>
                          <Reveal open={paid}>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-9 pt-2 text-xs">
                              <p className="text-muted-foreground">{run?.note ?? "Delivered to their pending balance, encrypted."}</p>
                              <TxSlot signature={run?.signature} />
                            </div>
                          </Reveal>
                        </div>
                      </Reveal>
                    </li>
                  );
                })}
                {editing && listed.length === 0 ? <li className="px-5 py-4 text-xs text-muted-foreground sm:px-6">Nobody matches &ldquo;{query.trim()}&rdquo;.</li> : null}
              </ul>

              <Reveal open={editing}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-[11px] text-muted-foreground sm:px-6">
                  <span>{full ? `Up to ${MAX_SPLIT_ROWS} destinations per split.` : "The primary takes the rounding remainder. A 0% destination is not paid."}</span>
                  <Link href="/admin/addresses" className="font-medium text-primary hover:underline">
                    Manage addresses
                  </Link>
                </div>
                {!v.isLive ? (
                  <div className="flex items-center justify-between gap-4 border-t border-border/60 bg-muted/20 px-5 py-3 sm:px-6">
                    <div>
                      <p className="text-xs font-medium text-foreground">Simulate a failure</p>
                      <p className="text-[11px] text-muted-foreground">Demo only: force one transfer to fail to try retry and resume.</p>
                    </div>
                    <Switch checked={failDemo} onCheckedChange={setFailDemo} aria-label="Force one demo transfer to fail" />
                  </div>
                ) : null}
              </Reveal>
            </div>
          </section>

          {/* Run control: the same panel as on Run payroll. */}
          <aside className="plate enter relative overflow-hidden p-5 sm:p-6 lg:sticky lg:top-20" style={{ ["--i" as string]: 3 }} aria-labelledby="control-heading">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-verified/5 blur-3xl" aria-hidden />
            <div className="relative space-y-5">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-verified/10 text-verified shadow-2xs">
                  <SendIcon className="size-4" />
                </div>
                <div>
                  <h2 id="control-heading" className="text-sm font-semibold tracking-tight text-foreground">
                    Run control
                  </h2>
                  <p className="text-[11px] text-muted-foreground">Simulate, approve, dispatch</p>
                </div>
                {canStartOver ? <StartOverButton onClick={reset} /> : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Invoice total</span>
                  <StatusBadge tone="key">Encrypted on-chain</StatusBadge>
                </div>
                {/* Typed by the admin in this tab, so it is shown as typed. Each part is encrypted when it is sent. */}
                <p className="font-mono text-3xl font-bold tracking-tight text-foreground tnum">
                  {total !== null && total > 0n ? formatUsdc(total) : "–"}
                  <span className="ml-1.5 font-sans text-base font-semibold text-muted-foreground">USDC</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {paying.length} payment{paying.length === 1 ? "" : "s"} · about {paying.length * (v.isLive ? 6 : 7)} transactions
                  <InfoTooltip content="Per destination: three temporary proof accounts are created and verified, the encrypted transfer is sent, then the proof accounts are closed and their rent comes back." />
                </p>
                <Reveal open={executing}>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {paidCount} of {sim.rows.length} paid
                      </span>
                      <span className="font-mono tnum">{Math.round((phase === "done" ? 1 : sim.progress) * 100)}%</span>
                    </div>
                    <RecipientBar rows={sim.rows} stageCount={PIPELINE_STAGES.length} />
                  </div>
                </Reveal>
              </div>

              {v.isLive ? <SigningCard payments={paying.length} locked={executing && !halted && phase !== "done"} /> : null}

              <div>
                <ProgressButton
                  progress={progress}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="h-11 w-full text-sm"
                  idleClassName={halted ? "border border-destructive/30 bg-failed-soft text-destructive hover:bg-destructive/10" : "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"}
                >
                  {action.icon}
                  {action.label}
                </ProgressButton>

                <Reveal open={editing && showAll && !!ruleProblem}>
                  <p className="pt-2.5 text-xs text-destructive" role="status">
                    {ruleProblem}
                  </p>
                </Reveal>

                <Reveal open={phase === "done"}>
                  <div className="grid grid-cols-2 gap-2 pt-2.5">
                    <Button variant="outline" className="h-10 text-xs" onClick={reset}>
                      New split
                    </Button>
                    <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "h-10 text-xs")}>
                      Overview
                    </Link>
                  </div>
                </Reveal>
              </div>

              <div className="border-t border-border/60 pt-4">
                <PhaseRail flow={flow} current={status} />
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <LockIcon className="size-3" />
                Amounts are encrypted on-chain. Addresses are public.
              </p>
            </div>
          </aside>
        </div>
      )}

      <DisclosureCard title="Why the split is worked out in your browser" description="The program can't read encrypted amounts, so it can't enforce percentages.">
        <p className="mb-2">
          Token-2022 confidential accounts hold encrypted balances, so the vault program never sees how much each transfer carries. The split is worked out here, in base units, and each part is sent as its own encrypted payment.
        </p>
        <p>The mint&apos;s auditor can decrypt each payment afterwards and check that the parts match the rule.</p>
      </DisclosureCard>
    </div>
  );
}
