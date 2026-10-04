"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Address } from "@/components/crypto/fingerprint";
import { useKeys } from "@/components/crypto/key-context";
import { PipelineTrack, RunningLine } from "@/components/crypto/pipeline-track";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { VaultGate } from "@/components/app/vault-gate";
import { PIPELINE_STAGES, TRANSFER_STAGE, type Employee, type RunStatus } from "@/lib/mock/data";
import { shortToday } from "@/lib/mock/store";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useRunSimulation } from "@/lib/payroll/use-run-simulation";
import { cn } from "@/lib/utils";

type Phase = "review" | "simulating" | "simulated" | "executing" | "done";
type CheckState = "idle" | "running" | "pass" | "fail";
type Fix = { kind: "skip"; ids: string[]; label: string } | { kind: "resume" };
interface Check { id: string; label: string; ok: boolean; detail: string; fix?: Fix; state: CheckState }

const BASE_FLOW: { id: RunStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "approved", label: "Approved" },
  { id: "executing", label: "Executing" },
  { id: "done", label: "Done" },
];

export default function RunPayrollPage() {
  return (
    <VaultGate title="Run payroll">
      <RunPayroll />
    </VaultGate>
  );
}

function RunPayroll() {
  const keys = useKeys();
  const v = useVault();
  const employees = v.vault.employees;
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [phaseState, setPhase] = useState<Phase>("review");
  const [checks, setChecks] = useState<Check[]>([]);
  const [failDemo, setFailDemo] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);

  const included = useMemo(() => employees.filter((e) => !excluded.has(e.id)), [employees, excluded]);
  const total = included.reduce((n, e) => n + e.salary, 0n);
  const sim = useRunSimulation(useMemo(() => included.map((e) => e.id), [included]), PIPELINE_STAGES.length, TRANSFER_STAGE);
  const phase: Phase = phaseState === "executing" && sim.done ? "done" : phaseState;
  const halted = phase === "executing" && !sim.running && sim.failedCount > 0;

  const status: RunStatus = halted ? "failed" : phase === "review" || phase === "simulating" ? "draft" : phase === "simulated" ? "pending_approval" : phase === "executing" ? "executing" : "done";
  const flow = status === "failed" ? [...BASE_FLOW.slice(0, 3), { id: "failed" as RunStatus, label: "Needs attention" }] : BASE_FLOW;
  const allPass = checks.length > 0 && checks.every((c) => c.state === "pass");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Each recipient is credited the moment it confirms, so a partial run leaves honest balances behind.
  useEffect(() => {
    for (const r of sim.rows) {
      if (r.status !== "done" || !r.signature || credited.current.has(r.id)) continue;
      credited.current.add(r.id);
      const e = employees.find((x) => x.id === r.id);
      if (e) v.pay(e.wallet, e.salary, r.signature, `${v.vault.name} payroll`);
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
      label: `${new Date().toLocaleDateString("en-US", { month: "long" })} payroll`,
      date: shortToday(),
      status: "done",
      recipients: items.length,
      total: items.reduce((n, i) => n + i.amount, 0n),
      items,
    });
    toast.success("Payroll complete", { description: `${items.length} payments sent. Amounts stayed encrypted.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (halted) toast.error(`${sim.failedCount} payment${sim.failedCount === 1 ? "" : "s"} failed`, { description: "Confirmed payments are safe. Retry the rest from the sidebar." });
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
      { id: "auth", label: "Connected wallet is the vault admin", ok: true, detail: `${shortAddress(v.admin)} is the vault authority` },
      { id: "cov", label: "Treasury covers the total", ok: covered, detail: covered ? `${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed` : `Only ${formatUsdc(v.vault.treasury)} available, ${formatUsdc(sum)} needed. Fund the treasury first.` },
      missing.length === 0
        ? { id: "act", label: "Every recipient has an activated account", ok: true, detail: `${list.length} of ${list.length} activated` }
        : { id: "act", label: "Every recipient has an activated account", ok: false, detail: `${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "has" : "have"} not activated an account`, fix: { kind: "skip", ids: missing.map((m) => m.id), label: "Skip them and re-run" } },
      { id: "dup", label: "No duplicate wallets or zero amounts", ok: !dup && !zero, detail: dup ? "The same wallet appears twice" : zero ? "An amount is zero" : "All wallets are unique and amounts are positive" },
      { id: "pause", label: "Payroll is not paused", ok: !paused, detail: paused ? "Payroll is paused, so pay_employee would be rejected" : "Vault is active", fix: paused ? { kind: "resume" } : undefined },
    ];
  };

  const runSimulation = useCallback((list: Employee[], paused = v.vault.paused) => {
    if (!keys.requireKeys()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const results = buildChecks(list, paused);
    setChecks(results.map((r) => ({ ...r, state: "idle" })));
    setPhase("simulating");
    results.forEach((r, i) => {
      timers.current.push(setTimeout(() => setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: "running" } : x))), i * 560));
      timers.current.push(
        setTimeout(() => {
          setChecks((c) => c.map((x, j) => (j === i ? { ...x, state: r.ok ? "pass" : "fail" } : x)));
          if (i === results.length - 1) setPhase("simulated");
        }, i * 560 + 480),
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
      v.setPaused(false);
      toast("Payroll resumed", { description: "Payouts can run again." });
      runSimulation(included, false);
    }
  };

  const approveAndRun = () => {
    setPhase("executing");
    credited.current.clear();
    recorded.current = false;
    // Demo hook: the second recipient fails once at the transfer stage, to show failure and resume.
    const target = included[Math.min(1, included.length - 1)];
    sim.start(failDemo && target ? { [target.id]: TRANSFER_STAGE } : {});
  };
  const reset = () => {
    setPhase("review");
    setChecks([]);
    sim.reset();
  };

  const primary =
    phase === "review" ? { label: keys.ready ? "Simulate run" : "Unlock keys and simulate", onClick: () => runSimulation(included), disabled: included.length === 0 }
    : phase === "simulating" ? { label: "Simulating…", onClick: () => {}, disabled: true }
    : phase === "simulated" ? { label: "Approve and run", onClick: approveAndRun, disabled: !allPass }
    : halted ? { label: `Retry ${sim.failedCount} failed`, onClick: sim.retryFailed, disabled: false }
    : phase === "executing" ? { label: "Sending…", onClick: () => {}, disabled: true }
    : { label: "Start another run", onClick: reset, disabled: false };

  return (
    <>
      <PageHeader title="Run payroll" description="Review the list, simulate, then approve. Nothing moves before you approve." />

      <ol className="enter mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ ["--i" as string]: 1 }} aria-label="Run steps">
        {[["Review", ["review"]], ["Simulate", ["simulating", "simulated"]], ["Approve and run", ["executing", "done"]]].map(([label, ph], i, arr) => {
          const active = (ph as string[]).includes(phase);
          const doneStep = arr.findIndex(([, p]) => (p as string[]).includes(phase)) > i;
          return (
            <li key={label as string} className="flex items-center gap-2">
              <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-medium transition-colors duration-300", doneStep ? "bg-verified text-white" : active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                {doneStep ? <CheckIcon className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("transition-colors duration-300", active ? "font-medium text-foreground" : "text-muted-foreground")}>{label as string}</span>
              {i < arr.length - 1 ? <ChevronRightIcon className="size-4 text-border" /> : null}
            </li>
          );
        })}
      </ol>

      {employees.length === 0 ? (
        <section className="plate enter mx-auto max-w-xl p-8 text-center">
          <p className="text-[15px] font-medium">No one on payroll yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the people you pay, then come back to run payroll.</p>
          <Link href="/admin/employees" className={cn(buttonVariants(), "mt-5 h-10 px-5")}>Add employees</Link>
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-5">
            {(phase === "review" || phase === "simulating" || phase === "simulated") && (
              <section className="plate enter overflow-hidden" style={{ ["--i" as string]: 2 }} aria-label="Recipients">
                <ul>
                  {employees.map((e) => {
                    const on = !excluded.has(e.id);
                    const activated = v.isActivated(e.wallet);
                    return (
                      <li key={e.id} className={cn("row-hover flex items-center gap-3 border-b px-4 py-3 last:border-b-0 transition-opacity duration-300", !on && "opacity-45")}>
                        <Checkbox checked={on} onCheckedChange={(c) => toggle(e.id, !!c)} disabled={phase !== "review"} aria-label={`Include ${e.name}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.name}</p>
                          <Address value={e.wallet} className="text-muted-foreground" />
                        </div>
                        {!activated ? <StatusBadge tone="pending" className="hidden sm:inline-flex">Not activated</StatusBadge> : null}
                        <p className="w-28 text-right font-mono text-sm tnum">{formatUsdc(e.salary)}</p>
                      </li>
                    );
                  })}
                </ul>
                {phase === "review" ? (
                  <div className="flex items-center justify-between gap-4 border-t border-dashed bg-muted/40 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium">Demo control</p>
                      <p className="text-xs text-muted-foreground">Make one payment fail mid-run, to see how failure and resume look.</p>
                    </div>
                    <Switch checked={failDemo} onCheckedChange={setFailDemo} aria-label="Make one payment fail during the demo run" />
                  </div>
                ) : null}
              </section>
            )}

            {(phase === "simulating" || phase === "simulated") && (
              <section className="plate enter p-5" aria-label="Simulation" aria-live="polite">
                <h2 className="font-sans text-sm font-semibold tracking-normal">Simulation</h2>
                <ul className="mt-3 grid gap-2">
                  {checks.map((c) => (
                    <li key={c.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-[background-color,border-color] duration-300 ease-out-expo", c.state === "pass" && "border-verified/30 bg-verified-soft", c.state === "fail" && "border-destructive/30 bg-failed-soft", c.state === "running" && "border-primary/40 bg-accent")}>
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-white transition-[background-color,transform] duration-300", c.state === "pass" ? "scale-100 bg-verified" : c.state === "fail" ? "bg-destructive" : "bg-input")}>
                        {c.state === "pass" ? <CheckIcon className="size-3" strokeWidth={3} /> : c.state === "fail" ? <XIcon className="size-3" strokeWidth={3} /> : c.state === "running" ? <span className="size-1.5 rounded-full bg-primary [animation:dot-pulse_700ms_ease-in-out_infinite]" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.state === "idle" ? "Waiting" : c.state === "running" ? "Checking…" : c.detail}</p>
                      </div>
                      {c.state === "fail" && c.fix ? (
                        <Button size="sm" variant="outline" onClick={() => applyFix(c.fix!)}>
                          {c.fix.kind === "skip" ? c.fix.label : "Resume payroll and re-run"}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(phase === "executing" || phase === "done") && (
              <section className="plate enter overflow-hidden" aria-label="Payout progress" aria-live="polite">
                {halted ? (
                  <p className="border-b bg-failed-soft px-4 py-3 text-[13px] text-destructive">
                    {sim.failedCount} payment{sim.failedCount === 1 ? "" : "s"} did not go through. Everyone else is confirmed and will not be paid again. Retry resumes from where each one stopped.
                  </p>
                ) : null}
                <ul>
                  {sim.rows.map((r) => {
                    const e = employees.find((x) => x.id === r.id)!;
                    return (
                      <li key={r.id} className="border-b px-4 py-3.5 last:border-b-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{e.name}</p>
                            <p className="font-mono text-xs text-muted-foreground tnum">{formatUsdc(e.salary)} USDC</p>
                          </div>
                          <StatusBadge tone={r.status === "done" ? "verified" : r.status === "failed" ? "failed" : r.status === "running" ? "key" : "neutral"} pulse={r.status === "running"}>
                            {r.status === "done" ? "Confirmed" : r.status === "failed" ? "Failed" : r.status === "running" ? (r.waiting ? "Waiting" : "Sending") : "Queued"}
                          </StatusBadge>
                        </div>
                        <div className="mt-3"><PipelineTrack stages={PIPELINE_STAGES} completed={r.completed} status={r.status} compact /></div>
                        <div className="mt-2 min-h-5">
                          {r.status === "failed" ? (
                            <p className="enter-fade text-xs text-destructive">{r.error}</p>
                          ) : r.status === "done" ? (
                            <p className="enter-fade font-mono text-[11.5px] text-muted-foreground">tx {r.signature?.slice(0, 10)}…{r.signature?.slice(-6)}</p>
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

          <aside className="plate enter p-5 lg:sticky lg:top-20" style={{ ["--i" as string]: 3 }} aria-label="Run summary">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Recipients</dt><dd className="tnum font-medium">{included.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-mono font-medium tnum">{formatUsdc(total)} USDC</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Transactions</dt><dd className="tnum font-medium">about {included.length * 7}</dd></div>
            </dl>
            <div className="mt-5" aria-label={`Progress ${Math.round(sim.progress * 100)}%`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-out-expo", halted ? "bg-destructive" : "bg-primary")} style={{ transform: `scaleX(${phase === "done" ? 1 : sim.progress})` }} />
              </div>
              <p className="mt-1.5 text-xs tnum text-muted-foreground">{Math.round((phase === "done" ? 1 : sim.progress) * 100)}% of stages complete</p>
            </div>
            <Button className="mt-5 h-10 w-full" onClick={primary.onClick} disabled={primary.disabled}>{primary.label}</Button>
            {phase === "done" ? (
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "mt-2 h-10 w-full")}>Back to overview</Link>
            ) : null}
            <ol className="mt-6 grid gap-1.5 border-t pt-4" aria-label="Run status">
              {flow.map((s, i) => {
                const idx = flow.findIndex((x) => x.id === status);
                const reached = i <= idx;
                return (
                  <li key={s.id} className={cn("flex items-center gap-2.5 text-[13px] transition-colors duration-300", reached ? "text-foreground" : "text-muted-foreground")}>
                    <span className={cn("size-2 rounded-full transition-[background-color,transform] duration-300", i === idx ? (s.id === "failed" ? "scale-125 bg-destructive" : "scale-125 bg-primary") : reached ? "bg-verified" : "bg-input")} />
                    {s.label}
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}
    </>
  );
}
