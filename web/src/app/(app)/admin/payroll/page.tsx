"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon, HelpCircleIcon, RefreshCwIcon, SendIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Address } from "@/components/crypto/fingerprint";
import { useKeys } from "@/components/crypto/key-context";
import { PipelineTrack, RunningLine } from "@/components/crypto/pipeline-track";
import { WalletCountdown } from "@/components/app/wallet-countdown";
import { useOperator } from "@/components/app/operator-context";
import { PayrollPicker, AddPayroll } from "@/components/app/payroll-picker";
import { PayrollGate } from "@/components/data/payroll-gate";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { PIPELINE_STAGES, TRANSFER_STAGE, type Employee, type RunStatus } from "@/lib/mock/data";
import { shortToday } from "@/lib/mock/store";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useAccountStatus } from "@/components/app/employee-context";
import { useLiveRun, type RunSettings } from "@/lib/payroll/use-live-run";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { EmptyState } from "@/components/app/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { cn } from "@/lib/utils";

type Phase = "review" | "simulating" | "simulated" | "executing" | "done";
type CheckState = "idle" | "running" | "pass" | "fail";
type Fix = { kind: "skip"; ids: string[]; label: string } | { kind: "resume" };
interface Check { id: string; label: string; ok: boolean; detail: string; fix?: Fix; state: CheckState }

/** Rent for the temporary proof accounts plus fees. The rent is refunded when they are closed. */
const MIN_SOL_FOR_RUN = 15_000_000n;

const BASE_FLOW: { id: RunStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "approved", label: "Approved" },
  { id: "executing", label: "Executing" },
  { id: "done", label: "Done" },
];

export default function RunPayrollPage() {
  return (
    <PayrollGate title="Run payroll">
      <RunPayroll />
    </PayrollGate>
  );
}

function RunPayroll() {
  const keys = useKeys();
  const v = useVault();
  const guard = useLiveGuard();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const payroll = v.vault.payrolls.find((p) => p.id === chosenId) ?? v.vault.payrolls[0] ?? null;
  const employees = useMemo<Employee[]>(() => (payroll?.entries ?? []).map((e) => ({ id: e.id, name: e.name, role: "", wallet: e.wallet, salary: e.amount })), [payroll]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [phaseState, setPhase] = useState<Phase>("review");
  const [checks, setChecks] = useState<Check[]>([]);
  const [failDemo, setFailDemo] = useState(false);
  const { auto, runSettings, live: autoLive, setModalOpen } = useOperator();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);

  const included = useMemo(() => employees.filter((e) => !excluded.has(e.id)), [employees, excluded]);
  const total = included.reduce((n, e) => n + e.salary, 0n);
  const account = useAccountStatus();
  const ids = useMemo(() => included.map((e) => e.id), [included]);
  const liveItems = useMemo(() => included.map((e) => ({ id: e.id, name: e.name, wallet: e.wallet, amount: e.salary })), [included]);
  const mockSim = useRunSimulation(ids, PIPELINE_STAGES.length, TRANSFER_STAGE);
  const liveSim = useLiveRun(liveItems, PIPELINE_STAGES.length, runSettings);
  const sim = v.isLive ? liveSim : mockSim;
  const phase: Phase = phaseState === "executing" && sim.done ? "done" : phaseState;
  const halted = phase === "executing" && !sim.running && sim.failedCount > 0;

  const status: RunStatus = halted ? "failed" : phase === "review" || phase === "simulating" ? "draft" : phase === "simulated" ? "pending_approval" : phase === "executing" ? "executing" : "done";
  const flow = status === "failed" ? [...BASE_FLOW.slice(0, 3), { id: "failed" as RunStatus, label: "Needs attention" }] : BASE_FLOW;
  const allPass = checks.length > 0 && checks.every((c) => c.state === "pass");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    for (const r of sim.rows) {
      if (r.status !== "done" || !r.signature || credited.current.has(r.id)) continue;
      credited.current.add(r.id);
      const e = employees.find((x) => x.id === r.id);
      if (e && !v.isLive) v.pay(e.wallet, e.salary, r.signature, `${v.vault.name} payroll`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.rows]);

  useEffect(() => {
    if (phase !== "done" || recorded.current) return;
    recorded.current = true;
    const items = sim.rows.flatMap((r) => {
      const e = employees.find((x) => x.id === r.id);
      return e && r.signature ? [{ wallet: e.wallet, name: e.name, amount: e.salary, signature: r.signature }] : [];
    });
    v.recordRun({
      id: `run-${Date.now()}`,
      label: payroll?.name ?? `${new Date().toLocaleDateString("en-US", { month: "long" })} payroll`,
      date: shortToday(),
      status: "done",
      recipients: items.length,
      total: items.reduce((n, i) => n + i.amount, 0n),
      items,
    }, payroll?.id).catch((e) => toast.error("Payroll sent, but the run couldn't be saved to your history", { description: e instanceof Error ? e.message : "The payments are on-chain and unaffected." }));
    toast.success("Payroll complete", { description: `${items.length} payments sent. Amounts stayed encrypted.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (halted) toast.error(`${sim.failedCount} payment${sim.failedCount === 1 ? "" : "s"} failed`, { description: "Confirmed payments are safe. Retry the rest from the summary panel." });
  }, [halted, sim.failedCount]);

  const toggle = (id: string, on: boolean) => {
    if (phase !== "review") return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id); else next.add(id);
      return next;
    });
  };

  const buildChecks = (list: Employee[], paused: boolean): Omit<Check, "state">[] => {
    const sum = list.reduce((n, e) => n + e.salary, 0n);
    const missing = list.filter((e) => !v.isActivated(e.wallet));
    const dup = new Set(list.map((e) => e.wallet)).size !== list.length;
    const zero = list.some((e) => e.salary <= 0n);
    const covered = v.vault.treasury >= sum;
    return [
      { id: "auth", label: "Connected wallet is the vault admin", ok: true, detail: `${shortAddress(v.admin)} is the authorized vault authority` },
      { id: "cov", label: "Treasury covers the total payroll", ok: covered, detail: covered ? `${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed` : `Only ${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed. Fund treasury first.` },
      missing.length === 0
        ? { id: "act", label: "Every recipient has an activated confidential account", ok: true, detail: `${list.length} of ${list.length} recipients active` }
        : { id: "act", label: "Every recipient has an activated confidential account", ok: false, detail: `${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "has" : "have"} not activated an account`, fix: { kind: "skip", ids: missing.map((m) => m.id), label: "Skip inactive recipients" } },
      { id: "dup", label: "No duplicate wallets or zero amounts", ok: !dup && !zero, detail: dup ? "Duplicate wallet detected in batch" : zero ? "One or more amounts are zero" : "All destination addresses unique with positive amounts" },
      ...(v.isLive
        ? [{ id: "sol", label: "Sufficient SOL for rent & gas fees", ok: account.sol >= MIN_SOL_FOR_RUN, detail: account.sol >= MIN_SOL_FOR_RUN ? `${(Number(account.sol) / 1e9).toFixed(3)} SOL available in admin wallet` : `Each payment requires temporary proof account rent. Available: ${(Number(account.sol) / 1e9).toFixed(3)} SOL.` }]
        : []),
      { id: "pause", label: "Payroll vault is active", ok: !paused, detail: paused ? "Payroll is paused; pay_employee instruction would revert" : "Vault active and accepting payout batches", fix: paused ? { kind: "resume" } : undefined },
    ];
  };

  const runSimulation = useCallback((list: Employee[], paused = v.vault.paused) => {
    if (!keys.requireKeys()) return;
    if (v.isLive && v.treasuryStatus !== "ready") {
      toast(v.treasuryStatus === "error" ? "Couldn't read treasury balance" : "Decrypting treasury balance", { description: v.treasuryError ?? "Please try again in a moment." });
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const results = buildChecks(list, paused);
    setChecks(results.map((r) => ({ ...r, state: "idle" })));
    setPhase("simulating");
    results.forEach((r, i) => {
      timers.current.push(setTimeout(() => setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: "running" } : x))), i * 500));
      timers.current.push(
        setTimeout(() => {
          setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: r.ok ? "pass" : "fail" } : x)));
          if (i === results.length - 1) setPhase("simulated");
        }, i * 500 + 440),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, v.vault.paused, v.vault.treasury, employees]);

  const applyFix = (fix: Fix) => {
    if (fix.kind === "skip") {
      const ids = new Set([...excluded, ...fix.ids]);
      setExcluded(ids);
      runSimulation(employees.filter((e) => !ids.has(e.id)));
    } else {
      void (async () => {
        if (!v.isLive && !guard()) return;
        if (!(await v.setPaused(false))) return;
        toast("Payroll resumed", { description: "Payouts can run again." });
        runSimulation(included, false);
      })();
    }
  };

  const approveAndRun = () => {
    if (v.isLive) {
      if (!keys.requireKeys()) return;
      if (!liveSim.canSign) {
        toast.error("This wallet can't sign devnet transactions", { description: "Try a different wallet." });
        return;
      }
      setPhase("executing");
      credited.current.clear();
      recorded.current = false;
      liveSim.start();
      return;
    }
    setPhase("executing");
    credited.current.clear();
    recorded.current = false;
    const target = included[Math.min(1, included.length - 1)];
    mockSim.start(failDemo && target ? { [target.id]: TRANSFER_STAGE } : {});
  };

  const reset = () => {
    setPhase("review");
    setChecks([]);
    sim.reset();
  };

  const primary =
    phase === "review" ? { label: keys.ready ? "Simulate Batch" : "Unlock Keys & Simulate", onClick: () => runSimulation(included), disabled: included.length === 0 }
    : phase === "simulating" ? { label: "Simulating…", onClick: () => {}, disabled: true }
    : phase === "simulated" ? { label: "Approve & Execute", onClick: approveAndRun, disabled: !allPass }
    : halted ? { label: `Retry ${sim.failedCount} Failed`, onClick: sim.retryFailed, disabled: false }
    : phase === "executing" ? { label: "Executing Transfers…", onClick: () => {}, disabled: true }
    : { label: "Start Another Run", onClick: reset, disabled: false };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Run Payroll"
        description="Verify recipients, simulate on-chain conditions, and execute batched confidential payouts."
      />

      <div className="enter rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5 shadow-2xs backdrop-blur-sm" style={{ ["--i" as string]: 1 }}>
        <nav aria-label="Progress steps" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {[
            {
              id: "review",
              label: "Review Recipients",
              sub: `${included.length} recipients · ${formatUsdc(total)} USDC`,
              phases: ["review"],
            },
            {
              id: "simulating",
              label: "Pre-flight Simulation",
              sub: allPass ? "Checks passed" : phase === "simulating" ? "Simulating…" : "Ready to simulate",
              phases: ["simulating", "simulated"],
            },
            {
              id: "executing",
              label: "Execute Batch",
              sub: phase === "done" ? "All transfers complete" : phase === "executing" ? "Dispatching transfers" : "On-chain dispatch",
              phases: ["executing", "done"],
            },
          ].map((s, i, arr) => {
            const active = s.phases.includes(phase);
            const doneStep = arr.findIndex((x) => x.phases.includes(phase)) > i;
            return (
              <div key={s.id} className="flex flex-1 items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-all duration-300",
                      doneStep
                        ? "bg-verified text-white shadow-xs"
                        : active
                          ? "bg-primary text-primary-foreground shadow-xs ring-4 ring-primary/15"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {doneStep ? <CheckIcon className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-xs font-semibold sm:text-sm truncate transition-colors", active ? "text-foreground font-semibold" : doneStep ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{s.sub}</p>
                  </div>
                </div>
                {i < arr.length - 1 ? (
                  <div className="hidden sm:block flex-1 h-0.5 mx-3 rounded-full bg-border transition-colors duration-300 overflow-hidden">
                    <div
                      className={cn(
                        "h-full w-full transition-transform duration-500 ease-out-expo origin-left",
                        doneStep ? "bg-verified scale-x-100" : active ? "bg-primary/40 scale-x-50" : "scale-x-0"
                      )}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      {v.vault.payrolls.length > 0 ? (
        <PayrollPicker
          selected={payroll}
          onSelect={(id) => {
            setChosenId(id);
            setExcluded(new Set());
          }}
          locked={phase !== "review"}
        />
      ) : null}

      {employees.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="No payroll template selected"
          description="A payroll template pairs saved addresses with regular payment amounts. Create a template to run batched transfers."
          action={
            <div className="flex flex-wrap gap-2.5">
              <AddPayroll onCreated={(p) => setChosenId(p.id)} trigger={<Button className="h-9 px-4 text-xs" />} />
              <Link href="/admin/addresses" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-4 text-xs")}>
                Saved Addresses
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_330px]">
          <div className="grid gap-6">
            {(phase === "review" || phase === "simulating" || phase === "simulated") && (
              <section className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }} aria-label="Recipients">
                <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/30">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recipients ({included.length} of {employees.length} selected)
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">Amount (USDC)</span>
                </div>
                <ul className="divide-y divide-border/60">
                  {employees.map((e) => {
                    const on = !excluded.has(e.id);
                    const activated = v.isActivated(e.wallet);
                    return (
                      <li
                        key={e.id}
                        className={cn(
                          "row-hover flex items-center gap-3 px-5 py-3.5 transition-all duration-200",
                          !on && "opacity-40 bg-muted/10"
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(c) => toggle(e.id, !!c)}
                          disabled={phase !== "review"}
                          aria-label={`Include ${e.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
                          <Address value={e.wallet} className="text-xs text-muted-foreground font-mono" />
                        </div>
                        {!activated ? (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge tone="pending" className="text-[10.5px]">
                              Not activated
                            </StatusBadge>
                            <InfoTooltip content="Recipient has not yet registered an encrypted Token-2022 account. They must activate before they can receive confidential payouts." />
                          </div>
                        ) : null}
                        <p className="w-28 text-right font-mono text-sm font-medium tnum">
                          {formatUsdc(e.salary)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                {phase === "review" && !v.isLive ? (
                  <div className="flex items-center justify-between gap-4 border-t border-dashed bg-muted/30 px-5 py-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">Simulation failure test</p>
                      <p className="text-[11px] text-muted-foreground">Force one transfer failure to test automatic resume and safety checks.</p>
                    </div>
                    <Switch checked={failDemo} onCheckedChange={setFailDemo} aria-label="Toggle simulation test failure" />
                  </div>
                ) : null}
              </section>
            )}

            {(phase === "simulating" || phase === "simulated") && (
              <section className="plate enter p-5 sm:p-6" aria-label="Simulation results" aria-live="polite">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">Simulation Pre-flight Checks</h2>
                    <InfoTooltip content="All conditions are verified client-side before any transactions are dispatched to devnet." />
                  </div>
                  {allPass ? (
                    <StatusBadge tone="verified">All Checks Passed</StatusBadge>
                  ) : phase === "simulated" ? (
                    <StatusBadge tone="failed">Resolution Required</StatusBadge>
                  ) : (
                    <StatusBadge tone="key" pulse>Checking…</StatusBadge>
                  )}
                </div>

                <ul className="mt-4 grid gap-2.5">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3.5 rounded-xl border p-3 transition-all duration-300",
                        c.state === "pass" && "border-verified/30 bg-verified-soft/40",
                        c.state === "fail" && "border-destructive/30 bg-failed-soft/50",
                        c.state === "running" && "border-primary/40 bg-accent/30",
                        c.state === "idle" && "border-border/60 bg-muted/10 opacity-70"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full text-white transition-all duration-300",
                          c.state === "pass" ? "scale-100 bg-verified" : c.state === "fail" ? "bg-destructive" : c.state === "running" ? "bg-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {c.state === "pass" ? (
                          <CheckIcon className="size-3.5" strokeWidth={3} />
                        ) : c.state === "fail" ? (
                          <XIcon className="size-3.5" strokeWidth={3} />
                        ) : c.state === "running" ? (
                          <span className="size-2 rounded-full bg-white [animation:dot-pulse_700ms_ease-in-out_infinite]" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{c.label}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {c.state === "idle" ? "Pending validation" : c.state === "running" ? "Simulating on-chain conditions…" : c.detail}
                        </p>
                      </div>
                      {c.state === "fail" && c.fix ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyFix(c.fix!)}>
                          {c.fix.kind === "skip" ? c.fix.label : "Resume vault"}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(phase === "executing" || phase === "done") && (
              <section className="plate enter overflow-hidden" aria-label="Batch execution progress" aria-live="polite">
                {halted ? (
                  <div className="border-b border-destructive/20 bg-failed-soft px-5 py-3 text-xs text-destructive flex items-center justify-between">
                    <span>
                      {sim.failedCount} payment{sim.failedCount === 1 ? "" : "s"} did not complete. Confirmed payments are preserved and will not double-pay.
                    </span>
                    <Button size="sm" variant="outline" onClick={sim.retryFailed} className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                      <RefreshCwIcon className="mr-1 size-3" /> Retry Failed
                    </Button>
                  </div>
                ) : null}
                <ul className="divide-y divide-border/60">
                  {sim.rows.map((r) => {
                    const e = employees.find((x) => x.id === r.id)!;
                    return (
                      <li key={r.id} className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
                            <p className="font-mono text-xs text-muted-foreground tnum">{formatUsdc(e.salary)} USDC</p>
                          </div>
                          <StatusBadge
                            tone={r.status === "done" ? "verified" : r.status === "failed" ? "failed" : r.status === "running" ? "key" : "neutral"}
                            pulse={r.status === "running"}
                          >
                            {r.status === "done" ? "Confirmed" : r.status === "failed" ? "Failed" : r.status === "running" ? (r.waiting ? "Waiting" : "Processing") : "Queued"}
                          </StatusBadge>
                        </div>
                        <PipelineTrack stages={PIPELINE_STAGES} completed={r.completed} status={r.status} compact />
                        <div className="min-h-5 text-xs">
                          {r.status === "failed" ? (
                            <p className="enter-fade text-destructive">{r.error}</p>
                          ) : r.status === "done" ? (
                            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                              <span>tx {r.signature?.slice(0, 10)}…{r.signature?.slice(-6)}</span>
                              {r.note ? <span className="text-pending font-sans">({r.note})</span> : null}
                            </div>
                          ) : r.deadline ? (
                            <WalletCountdown note={r.note} deadline={r.deadline} />
                          ) : r.note ? (
                            <p className="enter-fade font-medium text-primary">{r.note}</p>
                          ) : (
                            <RunningLine stage={PIPELINE_STAGES[Math.min(r.completed, PIPELINE_STAGES.length - 1)]} active={r.status === "running"} waiting={r.waiting} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          <aside className="plate enter p-5 sm:p-6 lg:sticky lg:top-20 space-y-5" style={{ ["--i" as string]: 3 }} aria-label="Run summary">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Run Summary</h3>
              <p className="text-xs text-muted-foreground">Batch parameters & network allocation.</p>
            </div>

            <dl className="grid gap-2.5 text-xs">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <dt className="text-muted-foreground">Included Recipients</dt>
                <dd className="font-semibold text-foreground tnum">{included.length}</dd>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <dt className="text-muted-foreground">Total Payout</dt>
                <dd className="font-mono font-semibold text-foreground tnum">{formatUsdc(total)} USDC</dd>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  Transactions
                  <InfoTooltip content="Includes temporary proof accounts initialization, confidential transfer instruction, and rent reclaim." />
                </dt>
                <dd className="font-medium text-muted-foreground tnum">~{included.length * (v.isLive ? 6 : 7)} txs</dd>
              </div>
              {v.isLive ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Approvals</dt>
                  <dd className="font-medium text-right flex items-center gap-1.5 text-xs">
                    <span className={cn(autoLive ? "text-verified font-medium" : "text-muted-foreground")}>
                      {autoLive ? "Automated via helper" : `${included.length} manual prompts`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="text-primary hover:underline text-[11px]"
                    >
                      (Configure)
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="space-y-1.5" aria-label={`Progress ${Math.round(sim.progress * 100)}%`}>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Progress</span>
                <span className="font-mono tnum">{Math.round((phase === "done" ? 1 : sim.progress) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-out-expo", halted ? "bg-destructive" : "bg-primary")}
                  style={{ transform: `scaleX(${phase === "done" ? 1 : sim.progress})` }}
                />
              </div>
            </div>

            <Button className="h-11 w-full text-sm font-medium" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </Button>

            {phase === "done" ? (
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full text-xs")}>
                Return to Overview
              </Link>
            ) : null}

            <ol className="grid gap-2 border-t border-border/60 pt-4" aria-label="Run status phases">
              {flow.map((s, i) => {
                const idx = flow.findIndex((x) => x.id === status);
                const reached = i <= idx;
                return (
                  <li key={s.id} className={cn("flex items-center gap-2.5 text-xs transition-colors", reached ? "text-foreground font-medium" : "text-muted-foreground")}>
                    <span
                      className={cn(
                        "size-2 rounded-full transition-all duration-300",
                        i === idx ? (s.id === "failed" ? "scale-125 bg-destructive" : "scale-125 bg-primary") : reached ? "bg-verified" : "bg-muted"
                      )}
                    />
                    {s.label}
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}

      <DisclosureCard
        title="Zero-Knowledge Proof & Batched Delivery Details"
        description="How Solana Token-2022 handles confidential payroll batches without leaking balances."
      >
        <p className="mb-2">
          Each confidential payment consists of creating temporary equality and ciphertext validity proof accounts. Once the proof is validated on-chain by the ZK ElGamal program, the transfer instruction is processed, transferring tokens directly into the recipient&apos;s pending balance.
        </p>
        <p>
          Temporary accounts are closed immediately afterward, returning Solana rent lamports back to the administrator or helper account.
        </p>
      </DisclosureCard>
    </div>
  );
}
