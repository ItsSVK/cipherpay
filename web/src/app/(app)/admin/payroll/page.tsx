"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestoreIcon, CheckIcon, ChevronDownIcon, FilePlus2Icon, LockIcon, PlayIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, SendIcon, ShieldCheckIcon, SigmaIcon, UsersIcon, WalletIcon, XIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Address } from "@/components/crypto/fingerprint";
import { useKeys } from "@/components/crypto/key-context";
import { Cipher } from "@/components/crypto/cipher";
import { Flow, type FlowStep } from "@/components/crypto/flow";
import { ProgressButton, type ButtonProgress } from "@/components/app/progress-button";
import { PhaseRail, RecipientBar, Reveal, SignaturePrompt, TxSlot } from "@/components/app/run-payroll-parts";
import { useOperator, mmss } from "@/components/app/operator-context";
import { AddPayroll, DeletePayroll, PayrollRail } from "@/components/app/payroll-picker";
import { PayrollGate } from "@/components/data/payroll-gate";
import { useLiveGuard } from "@/components/app/live-guard";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useVault } from "@/components/app/vault-context";
import { PIPELINE_STAGES, TRANSFER_STAGE, type Employee, type RunStatus } from "@/lib/mock/data";
import { shortToday } from "@/lib/mock/store";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useAccountStatus } from "@/components/app/employee-context";
import { useLiveRun } from "@/lib/payroll/use-live-run";
import { useRunSimulation, type RecipientRun } from "@/lib/payroll/use-run-simulation";
import { checkSigning, suggestSigning, type SigningState } from "@/lib/payroll/signing-check";
import { EmptyState } from "@/components/app/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DisclosureCard } from "@/components/app/disclosure-card";
import { SealedAmount } from "@/components/app/sealed-amount";
import { sealedPreview, sealedTotalPreview } from "@/lib/sealed-amount";
import { cn } from "@/lib/utils";

type Phase = "review" | "simulating" | "simulated" | "executing" | "done";
type CheckState = "idle" | "running" | "pass" | "fail";
type Fix = { kind: "skip"; ids: string[]; label: string } | { kind: "resume" } | { kind: "operator"; label: string };
interface Check { id: string; label: string; ok: boolean; detail: string; fix?: Fix; state: CheckState }

/** Rent for the temporary proof accounts plus fees. The rent is refunded when they are closed. */
const MIN_SOL_FOR_RUN = 15_000_000n;

/** The five steps of one payment, as the engine reports them (PIPELINE_STAGES order). Labels are short so five fit a phone. */
const STAGE_LABEL = ["Prove", "Accounts", "Verify", "Transfer", "Close"] as const;
const STAGE_ICON = [<SigmaIcon key="p" />, <FilePlus2Icon key="c" />, <ShieldCheckIcon key="v" />, <SendIcon key="t" />, <ArchiveRestoreIcon key="x" />];
const STAGE_DETAIL = [
  "Building the equality, validity and range proofs in this tab.",
  "Creating the three temporary proof accounts.",
  "The ZK ElGamal program is verifying the proofs on-chain.",
  "Sending the encrypted transfer from the treasury.",
  "Closing the proof accounts. Their rent comes back.",
];

/** One recipient's run state as flow steps: finished ones done, the current one working (or waiting on the wallet), a failure marked where it stopped. */
function laneSteps(r: RecipientRun | undefined): FlowStep[] {
  const completed = r?.completed ?? 0;
  return STAGE_LABEL.map((label, i) => ({
    key: label,
    label,
    icon: STAGE_ICON[i],
    state:
      r?.status === "done" || i < completed
        ? "done"
        : i === completed && r?.status === "failed"
          ? "error"
          : i === completed && r?.status === "running"
            ? r.deadline
              ? "waiting"
              : "active"
            : "idle",
  }));
}

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
  const { runSettings, live: autoLive, setModalOpen, secondsLeft: autoSecondsLeft, status: autoStatus, settings: autoSettings, setSettings: setAutoSettings } = useOperator();
  const autoLow = autoLive && autoSecondsLeft <= 10;
  // How the run would be signed right now. Read through a ref by the checks, which run from timers and callbacks.
  const signingNow: SigningState = autoLive && autoStatus ? { mode: "automatic", secondsLeft: autoSecondsLeft, paymentsLeft: autoStatus.paymentsLeft } : { mode: "manual" };
  const signingRef = useRef(signingNow);
  useEffect(() => {
    signingRef.current = signingNow;
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const credited = useRef(new Set<string>());
  const recorded = useRef(false);

  const included = useMemo(() => employees.filter((e) => !excluded.has(e.id)), [employees, excluded]);
  const total = included.reduce((n, e) => n + e.salary, 0n);
  // The real sealed amounts as saved, shown (7 characters) while the figures are encrypted.
  const sealedById = useMemo(() => new Map((payroll?.entries ?? []).map((e) => [e.id, e.amountCt])), [payroll]);
  const totalCipher = useMemo(() => sealedTotalPreview(included.map((e) => sealedById.get(e.id))), [included, sealedById]);
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
        ? [
            { id: "sol", label: "Sufficient SOL for rent & gas fees", ok: account.sol >= MIN_SOL_FOR_RUN, detail: account.sol >= MIN_SOL_FOR_RUN ? `${(Number(account.sol) / 1e9).toFixed(3)} SOL available in admin wallet` : `Each payment requires temporary proof account rent. Available: ${(Number(account.sol) / 1e9).toFixed(3)} SOL.` },
            // Automatic payroll stops part way if its payment count or time runs out, so check both against this run.
            ...checkSigning(signingRef.current, list.length).map((c) => ({ ...c, fix: c.ok ? undefined : ({ kind: "operator", label: "Adjust automatic payroll" } as Fix) })),
          ]
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
    if (payroll?.sealed) {
      toast(v.recordsStatus === "opening" ? "Decrypting this template's amounts" : "Can't read this template's amounts", {
        description: v.recordsStatus === "opening" ? "Please try again in a moment." : "They were saved under different keys or changed after saving. Delete the template and create it again.",
      });
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
  }, [keys, v.vault.paused, v.vault.treasury, employees, payroll?.sealed, v.recordsStatus]);

  // The authorization changed (turned on, off, re-authorized or expired) while the run waits for approval: the signing checks
  // are out of date, so run them again instead of leaving a stale pass or fail on screen.
  const authKey = autoLive && autoStatus ? `${autoStatus.expiresAt}:${autoStatus.paymentsLeft}` : "manual";
  const lastAuthKey = useRef(authKey);
  useEffect(() => {
    if (lastAuthKey.current === authKey) return;
    lastAuthKey.current = authKey;
    if (!v.isLive || phaseState !== "simulated") return;
    const t = setTimeout(() => runSimulation(included), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  const applyFix = (fix: Fix) => {
    if (fix.kind === "operator") {
      // Prefill the smallest settings that cover this run; the dialog asks to turn the current authorization off and on again.
      const s = suggestSigning(included.length);
      setAutoSettings({ ...autoSettings, ttlSeconds: s.ttlSeconds ?? autoSettings.ttlSeconds, maxPayments: Math.max(s.maxPayments, autoSettings.maxPayments ?? 0) });
      setModalOpen(true);
      return;
    }
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
      // Time has passed since the checks ran (and the authorization may have changed): check signing again right before sending.
      const stale = checkSigning(signingRef.current, included.length).find((c) => !c.ok);
      if (stale) {
        toast.error("This run would stop part way", { description: stale.detail });
        runSimulation(included);
        return;
      }
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
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("review");
    setChecks([]);
    sim.reset();
  };

  /** Back to the beginning: every recipient included again, no checks. Only offered while nothing has been paid (see canStartOver). */
  const startOver = () => {
    reset();
    setExcluded(new Set());
  };

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "Recipient";
  const rowOf = (id: string) => sim.rows.find((r) => r.id === id);
  const executing = phase === "executing" || phase === "done";
  const paidCount = sim.rows.filter((r) => r.status === "done").length;
  const current = sim.rows.find((r) => r.status === "running");
  const signing = sim.rows.some((r) => r.deadline);
  // Safe only while no payment has gone out: a run that is sending can't be stopped, and forgetting confirmed payments
  // would let a re-run pay those people twice (partial runs aren't saved to history). After that, Retry failed is the way on.
  const canStartOver = (phase === "review" && excluded.size > 0) || phase === "simulating" || phase === "simulated" || (halted && paidCount === 0 && !sim.rows.some((r) => r.uncertain));
  const checksDone = checks.filter((c) => c.state === "pass" || c.state === "fail").length;
  const failedChecks = checks.filter((c) => c.state === "fail").length;
  // Amounts show as ciphertext until the keys are unlocked, exactly like the treasury on the overview.
  const amountsShown = keys.ready && !payroll?.sealed;
  const unreadable = !!payroll?.sealed && v.recordsStatus === "open";

  // The one action button. While something is happening it IS the progress indicator (same as pause / resume on the overview).
  const progress: ButtonProgress | null =
    phase === "simulating"
      ? { label: `Checking ${Math.min(checksDone + 1, checks.length)} of ${checks.length}…`, fill: checks.length ? (checksDone / checks.length) * 100 : 5 }
      : phase === "executing" && !halted
        ? {
            label: signing ? "Approve in wallet" : current ? `Paying ${paidCount + 1} of ${sim.rows.length} · ${STAGE_LABEL[Math.min(current.completed, STAGE_LABEL.length - 1)]}` : "Starting…",
            fill: Math.max(4, sim.progress * 100),
          }
        : phase === "done"
          ? { label: `Payroll sent · ${paidCount} paid`, fill: 100, done: true }
          : null;

  const action =
    phase === "review"
      ? { label: keys.ready ? "Simulate run" : "Unlock keys & simulate", icon: <PlayIcon className="size-3.5 fill-current" />, onClick: () => runSimulation(included), disabled: included.length === 0 }
      : phase === "simulated" && allPass
        ? { label: "Approve & run payroll", icon: <SendIcon className="size-3.5" />, onClick: approveAndRun, disabled: false }
        : phase === "simulated"
          ? { label: "Run checks again", icon: <RefreshCwIcon className="size-3.5" />, onClick: () => runSimulation(included), disabled: included.length === 0 }
          : halted
            ? { label: `Retry ${sim.failedCount} failed`, icon: <RefreshCwIcon className="size-3.5" />, onClick: sim.retryFailed, disabled: false }
            : { label: "", icon: null, onClick: () => {}, disabled: true };

  const statusTone = status === "failed" ? "failed" : status === "done" ? "verified" : status === "executing" ? "key" : status === "pending_approval" ? (allPass ? "verified" : "pending") : "neutral";
  const statusLabel = status === "failed" ? "Needs attention" : status === "done" ? "Completed" : status === "executing" ? "Executing" : status === "pending_approval" ? (allPass ? "Ready to approve" : `${failedChecks} to resolve`) : phase === "simulating" ? "Checking" : "Draft";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Run Payroll"
        description="Review who gets paid, check on-chain conditions, then send every payment as an encrypted transfer."
        actions={
          <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3.5 text-xs font-medium")}>
            Back to vault
          </Link>
        }
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="Create your first payroll"
          description="A payroll is a saved list of who you pay and how much. Create one, then run it whenever payday comes around."
          action={
            <div className="flex flex-wrap gap-2.5">
              <AddPayroll onCreated={(p) => setChosenId(p.id)} trigger={<Button className="h-9 gap-1.5 px-4 text-xs" />}>
                <PlusIcon className="size-3.5" /> New payroll
              </AddPayroll>
              <Link href="/admin/addresses" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-4 text-xs")}>
                Saved Addresses
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          {/* The batch: the same rows from review to done. Executing opens each row into its live payment lane. */}
          <section className="plate enter relative overflow-hidden" style={{ ["--i" as string]: 2 }} aria-labelledby="batch-heading">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/5 blur-3xl" aria-hidden />

            <div className="relative flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                  <UsersIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <h2 id="batch-heading" className="truncate text-sm font-semibold tracking-tight text-foreground">
                    {payroll?.name ?? "Payroll"}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {executing ? `${paidCount} of ${sim.rows.length} paid · one transfer at a time` : `${included.length} of ${employees.length} recipients included`}
                  </p>
                </div>
              </div>
              <StatusBadge tone={statusTone} pulse={status === "executing" && !halted}>
                {statusLabel}
              </StatusBadge>
            </div>

            {/* Master-detail: your payrolls on the left, the chosen one's recipients beside it. The column slides closed once checks start. */}
            <div
              className={cn(
                "relative mt-5 grid border-t border-border/60 transition-[grid-template-columns] duration-500 ease-out-expo",
                phase === "review" ? "lg:grid-cols-[232px_minmax(0,1fr)]" : "lg:grid-cols-[0px_minmax(0,1fr)]",
              )}
            >
              <div
                inert={phase !== "review"}
                className={cn(
                  "min-w-0 overflow-hidden border-b border-border/60 bg-muted/20 transition-opacity duration-300 lg:border-r lg:border-b-0",
                  phase === "review" ? "opacity-100" : "hidden opacity-0 lg:block",
                )}
              >
                <PayrollRail
                  selected={payroll}
                  revealed={keys.ready}
                  onSelect={(id) => {
                    setChosenId(id);
                    setExcluded(new Set());
                  }}
                />
              </div>
              <div className="min-w-0">
            <PreflightBand checks={checks} phase={phase} allPass={allPass} onFix={applyFix} />

            <SignaturePrompt rows={executing ? sim.rows : []} nameOf={nameOf} />

            {halted ? (
              <div className="enter-fade mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-failed-soft px-4 py-3 sm:mx-6" role="alert">
                <p className="text-xs text-destructive">
                  {sim.failedCount} payment{sim.failedCount === 1 ? "" : "s"} did not complete. Confirmed payments stay paid and are never sent twice.
                </p>
                <Button size="sm" variant="outline" onClick={sim.retryFailed} className="h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10">
                  <RefreshCwIcon className="mr-1 size-3" /> Retry failed
                </Button>
              </div>
            ) : null}

            <div className={cn("flex items-center justify-between gap-3 border-border/60 bg-muted/30 px-5 py-2 sm:px-6", phase === "review" ? "border-b" : "mt-4 border-y")}>
              <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
                {phase === "review" && payroll ? (
                  <>
                    Recipients in <span className="text-foreground">{payroll.name}</span> · {included.length} of {employees.length} included
                  </>
                ) : (
                  "Recipient"
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Amount (USDC)</span>
                {phase === "review" && payroll ? <DeletePayroll payroll={payroll} /> : null}
              </span>
            </div>

            <ul aria-live="polite">
              {employees.map((e, i) => {
                const on = !excluded.has(e.id);
                const r = rowOf(e.id);
                const activated = v.isActivated(e.wallet);
                const running = executing && r?.status === "running";
                const failed = executing && r?.status === "failed";
                const paid = executing && r?.status === "done";
                // Excluded recipients fold away once the run starts; included ones open into lanes.
                return (
                  <li key={e.id}>
                    <Reveal open={!executing || on}>
                      <div
                        className={cn(
                          "border-b border-border/60 px-5 py-3.5 transition-[background-color,opacity] duration-500 sm:px-6",
                          !executing && "row-hover",
                          !on && !executing && "opacity-45",
                          running && "bg-accent/35",
                          failed && "bg-failed-soft/50",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {executing ? (
                            <LaneMark status={r?.status ?? "pending"} />
                          ) : (
                            <Checkbox checked={on} onCheckedChange={(c) => toggle(e.id, !!c)} disabled={phase !== "review"} aria-label={`Include ${e.name}`} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
                              {!activated && !executing ? (
                                <StatusBadge tone="pending" className="text-[10.5px]">
                                  Not activated
                                </StatusBadge>
                              ) : null}
                            </div>
                            <Address value={e.wallet} className="text-xs text-muted-foreground" />
                          </div>
                          <div className="text-right">
                            {unreadable ? (
                              <SealedAmount status={v.recordsStatus} />
                            ) : (
                              <Cipher
                                value={formatUsdc(e.salary)}
                                seed={`run-${e.id}`}
                                cipherText={sealedPreview(sealedById.get(e.id))}
                                revealed={amountsShown}
                                delay={i * 90}
                                className="text-sm font-semibold text-foreground"
                              />
                            )}
                            {executing ? (
                              <p className={cn("mt-0.5 text-[11px] font-medium", paid ? "text-verified" : failed ? "text-destructive" : running ? "text-primary" : "text-muted-foreground")}>
                                {paid ? "Confirmed" : failed ? "Failed" : running ? (r?.deadline ? "Awaiting signature" : STAGE_LABEL[Math.min(r?.completed ?? 0, STAGE_LABEL.length - 1)]) : r?.waiting ? "Waiting" : "Queued"}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {/* Only the lane that is working (or stopped) opens; queued and paid ones stay one line. */}
                        <Reveal open={executing && on && (running || failed)}>
                          <div className="pt-4 sm:pl-9">
                            <Flow label={`Payment to ${e.name}`} steps={laneSteps(r)} />
                            <p className={cn("mt-3 text-xs", failed ? "text-destructive" : r?.deadline ? "text-primary" : "text-muted-foreground")}>
                              {failed ? r?.error : r?.deadline ? "Waiting for your wallet to approve the transfer." : r?.waiting ? "Waits for the previous transfer to land. Transfers from one treasury go one at a time." : STAGE_DETAIL[Math.min(r?.completed ?? 0, STAGE_DETAIL.length - 1)]}
                            </p>
                          </div>
                        </Reveal>
                        <Reveal open={paid}>
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-9 pt-2 text-xs">
                            <p className="text-muted-foreground">{r?.note ?? "Delivered to their pending balance, encrypted."}</p>
                            <TxSlot signature={r?.signature} />
                          </div>
                        </Reveal>
                      </div>
                    </Reveal>
                  </li>
                );
              })}
            </ul>

            {phase === "review" && !v.isLive ? (
              <div className="flex items-center justify-between gap-4 bg-muted/20 px-5 py-3 sm:px-6">
                <div>
                  <p className="text-xs font-medium text-foreground">Simulate a failure</p>
                  <p className="text-[11px] text-muted-foreground">Demo only: force one transfer to fail to try retry and resume.</p>
                </div>
                <Switch checked={failDemo} onCheckedChange={setFailDemo} aria-label="Force one demo transfer to fail" />
              </div>
            ) : null}
              </div>
            </div>
          </section>

          {/* Run control: the same shape as Vault Authority on the overview. */}
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
                {canStartOver ? (
                  <Button variant="ghost" size="sm" className="enter-fade ml-auto h-7 gap-1.5 rounded-full border border-primary/20 bg-accent/70 px-3 text-[11px] font-semibold text-accent-foreground shadow-2xs hover:border-primary/35 hover:bg-accent hover:text-accent-foreground [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:-rotate-90" onClick={startOver}>
                    <RotateCcwIcon className="size-3.5" /> Start over
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Batch total</span>
                  <StatusBadge tone={amountsShown ? "verified" : "key"}>{amountsShown ? "Decrypted locally" : unreadable ? "Unreadable" : "Encrypted"}</StatusBadge>
                </div>
                {unreadable ? (
                  <SealedAmount status={v.recordsStatus} />
                ) : (
                  <Cipher
                    value={formatUsdc(total)}
                    seed={`run-total-${payroll?.id ?? ""}`}
                    cipherText={totalCipher}
                    revealed={amountsShown}
                    suffix="USDC"
                    className="text-3xl font-bold tracking-tight text-foreground [&>span:last-child]:text-base [&>span:last-child]:font-semibold [&>span:last-child]:text-muted-foreground"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {included.length} recipient{included.length === 1 ? "" : "s"} · about {included.length * (v.isLive ? 6 : 7)} transactions
                  <InfoTooltip content="Per recipient: three temporary proof accounts are created and verified, the encrypted transfer is sent, then the proof accounts are closed and their rent comes back." />
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

              {v.isLive ? (
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-xs transition-colors duration-300",
                    !autoLive || autoLow ? "border-pending/30 bg-pending-soft" : "border-verified/25 bg-verified-soft",
                  )}
                >
                  <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg shadow-2xs", autoLive ? (autoLow ? "bg-pending text-white" : "bg-verified text-white") : "bg-card text-pending")}>
                    {autoLive ? <ZapIcon className="size-4 fill-current" /> : <WalletIcon className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      {autoLive ? "Automatic" : "Manual approvals"}
                      {autoLive ? (
                        <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-semibold tnum", autoLow ? "text-pending" : "text-verified")} role="timer" aria-label="Automatic payroll time left">
                          <span aria-hidden className="size-1.5 rounded-full bg-current [animation:dot-pulse_1.2s_ease-in-out_infinite]" />
                          {mmss(autoSecondsLeft)}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {autoLive
                        ? `Helper signs · ${autoStatus?.paymentsLeft ?? 0} payment${autoStatus?.paymentsLeft === 1 ? "" : "s"} left`
                        : `Your wallet approves each of ${included.length} payments.`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 shrink-0 bg-card text-[11px]" onClick={() => setModalOpen(true)} disabled={executing && !halted && phase !== "done"}>
                    {autoLive ? "Manage" : "Turn on"}
                  </Button>
                </div>
              ) : null}

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

              <Reveal open={phase === "done"}>
                <div className="grid grid-cols-2 gap-2 pt-2.5">
                  <Button variant="outline" className="h-10 text-xs" onClick={reset}>
                    New run
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

      <DisclosureCard
        title="What happens in each payment"
        description="How Token-2022 sends a confidential payment without revealing the amount."
      >
        <p className="mb-2">
          Each payment first creates temporary proof accounts (equality, ciphertext validity and range). The ZK ElGamal program verifies them on-chain, then the encrypted transfer lands in the recipient&apos;s pending balance.
        </p>
        <p>The proof accounts are closed right after, and their rent comes back to you or the payroll helper.</p>
      </DisclosureCard>
    </div>
  );
}

/** The lane's leading mark during a run: queued ring, running pulse, confirmed check, failed cross. */
function LaneMark({ status }: { status: RecipientRun["status"] }) {
  return (
    <span className="relative shrink-0" aria-hidden>
      {status === "running" ? <span className="absolute -inset-1 rounded-full border-2 border-dashed border-primary/40 animate-[spin_6s_linear_infinite]" /> : null}
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color] duration-500 ease-out-expo",
        status === "done" && "border-verified bg-verified text-white",
        status === "failed" && "border-destructive bg-destructive text-white",
        status === "running" && "border-primary/50 bg-primary/10",
        status === "pending" && "border-input bg-card",
      )}
    >
      {status === "done" ? (
        <CheckIcon className="size-3.5 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
      ) : status === "failed" ? (
        <XIcon className="size-3.5" strokeWidth={3} />
      ) : status === "running" ? (
        <span className="size-2 rounded-full bg-primary [animation:dot-pulse_900ms_ease-in-out_infinite]" />
      ) : null}
    </span>
    </span>
  );
}

/**
 * Pre-flight checks, inside the batch, as one collapsible panel. They open and tick through while checking. When every check
 * passes they stay open to be read, then fold to their header once the admin moves on (any click outside the panel, or
 * Approve). A failure keeps them open and cannot be folded. Re-running opens them again. The header can always reopen them.
 */
function PreflightBand({ checks, phase, allPass, onFix }: { checks: Check[]; phase: Phase; allPass: boolean; onFix: (f: Fix) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // What the admin chose with the header (or by clicking away); null = the phase's default. Reset whenever the phase changes.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [lastPhase, setLastPhase] = useState(phase);
  if (lastPhase !== phase) {
    setLastPhase(phase);
    setUserOpen(null);
  }

  const visible = phase !== "review" && checks.length > 0;
  const checking = phase === "simulating";
  const failed = checks.filter((c) => c.state === "fail").length;
  const passed = checks.filter((c) => c.state === "pass").length;
  const pinned = checking || (phase === "simulated" && !allPass);
  const open = pinned || (userOpen ?? phase === "simulated");

  // All green and still open: fold as soon as the admin clicks anywhere else (the Approve button included).
  const foldOnLeave = phase === "simulated" && allPass && open;
  useEffect(() => {
    if (!foldOnLeave) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [foldOnLeave]);

  const summary = checking
    ? `Checking ${Math.min(passed + failed + 1, checks.length)} of ${checks.length}…`
    : failed > 0
      ? `${failed} of ${checks.length} need${failed === 1 ? "s" : ""} attention`
      : allPass
        ? `All ${checks.length} checks passed`
        : "Checks done";

  return (
    <Reveal open={visible}>
      <div ref={ref} className="px-5 pt-4 sm:px-6">
        <div
          className={cn(
            "rounded-2xl border transition-colors duration-300",
            failed > 0 && !checking ? "border-destructive/25 bg-failed-soft/30" : allPass && !open ? "border-verified/25 bg-verified-soft/60" : "border-border/80 bg-muted/20",
          )}
        >
          <button
            type="button"
            onClick={() => !pinned && setUserOpen(!open)}
            aria-expanded={open}
            aria-controls="preflight-list"
            aria-disabled={pinned}
            className={cn("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50", pinned ? "cursor-default" : "cursor-pointer")}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-white transition-colors duration-300",
                checking ? "bg-primary" : failed > 0 ? "bg-destructive" : "bg-verified",
              )}
            >
              {checking ? (
                <span className="size-1.5 rounded-full bg-white [animation:dot-pulse_700ms_ease-in-out_infinite]" />
              ) : failed > 0 ? (
                <XIcon className="size-3" strokeWidth={3} />
              ) : (
                <CheckIcon className="size-3 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Pre-flight checks</p>
              <p className={cn("text-xs font-medium", checking ? "text-foreground" : failed > 0 ? "text-destructive" : "text-verified")}>{summary}</p>
            </div>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Read from devnet, nothing is sent</span>
            {!pinned ? <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} /> : null}
          </button>

          <Reveal open={open}>
            <ul id="preflight-list" className="grid gap-1.5 px-4 pb-4">
              {checks.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2 transition-[background-color,opacity] duration-300",
                    c.state === "fail" && "bg-failed-soft/70",
                    c.state === "running" && "bg-accent/40",
                    c.state === "idle" && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-white transition-colors duration-300",
                      c.state === "pass" ? "bg-verified" : c.state === "fail" ? "bg-destructive" : c.state === "running" ? "bg-primary" : "bg-muted",
                    )}
                  >
                    {c.state === "pass" ? (
                      <CheckIcon className="size-3 [animation:pop_var(--dur-base)_var(--ease-out)]" strokeWidth={3} />
                    ) : c.state === "fail" ? (
                      <XIcon className="size-3" strokeWidth={3} />
                    ) : c.state === "running" ? (
                      <span className="size-1.5 rounded-full bg-white [animation:dot-pulse_700ms_ease-in-out_infinite]" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground">{c.state === "idle" ? "Waiting" : c.state === "running" ? "Checking…" : c.detail}</p>
                  </div>
                  {c.state === "fail" && c.fix ? (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => onFix(c.fix!)}>
                      {c.fix.kind === "resume" ? "Resume vault" : c.fix.label}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </Reveal>
  );
}
