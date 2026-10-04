"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackStatus } from "@/components/crypto/pipeline-track";
import { fakeSig } from "@/lib/mock/data";

export interface RecipientRun {
  id: string;
  /** Stages finished so far. A retry resumes from here, never from zero. */
  completed: number;
  status: TrackStatus;
  /** Signature of the pay_employee transaction, set the moment the transfer lands. */
  signature?: string;
  error?: string;
  /** True while this recipient is ready to transfer but another transfer is still in flight. */
  waiting?: boolean;
}

const CONCURRENCY = 3;
const TICK_MS = 520;

export const FAIL_MESSAGE = "The network timed out before this transfer confirmed. The app re-checked on-chain state: nothing was sent.";

/**
 * MOCK payout engine for the UI pass. It mirrors the real pipeline's rules:
 * - proof and context stages run in parallel up to a concurrency limit;
 * - the transfer stage is serialized, because each equality proof is built against the treasury's
 *   current balance ciphertext, so transfer N must land before transfer N+1 (decision D3);
 * - per-recipient state is tracked, and a failed recipient can be retried from where it stopped
 *   without re-sending anyone who already confirmed.
 * The real one lives in lib/payroll and persists to D1 so interrupted runs resume without double-paying.
 */
export function useRunSimulation(ids: string[], stageCount: number, transferStage: number) {
  const idsKey = ids.join("|");
  const initial = useCallback((key: string): RecipientRun[] => key.split("|").filter(Boolean).map((id) => ({ id, completed: 0, status: "pending" })), []);

  const [state, setState] = useState<{ key: string; rows: RecipientRun[] }>(() => ({ key: idsKey, rows: initial(idsKey) }));
  const [running, setRunning] = useState(false);
  const rowsRef = useRef<RecipientRun[]>([]);
  const failRef = useRef<Record<string, number>>({});
  const tickRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // If the recipient list changed, show a fresh queue instead of the old rows.
  const rows = state.key === idsKey ? state.rows : initial(idsKey);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const commit = useCallback((next: RecipientRun[]) => {
    rowsRef.current = next;
    setState({ key: idsKey, rows: next });
  }, [idsKey]);

  const tick = useCallback(() => {
    tickRef.current += 1;
    const t = tickRef.current;
    const next = rowsRef.current.map((r) => ({ ...r }));

    let active = next.filter((r) => r.status === "running").length;
    for (const r of next) {
      if (r.status === "pending" && active < CONCURRENCY) {
        r.status = "running";
        active += 1;
      }
    }

    let transferTaken = false;
    next.forEach((r, i) => {
      if (r.status !== "running" || (t + i) % 2 !== 0) return;
      const stage = r.completed;
      if (stage === transferStage && transferTaken) {
        r.waiting = true;
        return;
      }
      r.waiting = false;
      if (failRef.current[r.id] === stage) {
        delete failRef.current[r.id];
        r.status = "failed";
        r.error = FAIL_MESSAGE;
        return;
      }
      if (stage === transferStage) {
        transferTaken = true;
        r.signature = fakeSig(`${r.id}:${t}`);
      }
      r.completed += 1;
      if (r.completed >= stageCount) r.status = "done";
    });

    commit(next);
    if (!next.some((r) => r.status === "pending" || r.status === "running")) {
      stop();
      setRunning(false);
    }
  }, [commit, stop, stageCount, transferStage]);

  const begin = useCallback(() => {
    stop();
    setRunning(true);
    timer.current = setInterval(tick, TICK_MS);
  }, [stop, tick]);

  /** `failPlan` is a demo hook: recipient id -> stage index at which the first attempt fails. */
  const start = useCallback((failPlan: Record<string, number> = {}) => {
    failRef.current = { ...failPlan };
    tickRef.current = 0;
    commit(initial(idsKey));
    begin();
  }, [begin, commit, idsKey, initial]);

  /** Resume only the failed recipients. Confirmed ones are left alone, so nobody is paid twice. */
  const retryFailed = useCallback(() => {
    commit(rowsRef.current.map((r) => (r.status === "failed" ? { ...r, status: "pending" as const, error: undefined } : r)));
    begin();
  }, [begin, commit]);

  const reset = useCallback(() => {
    stop();
    setRunning(false);
    failRef.current = {};
    commit(initial(idsKey));
  }, [commit, idsKey, initial, stop]);

  const done = rows.length > 0 && rows.every((r) => r.status === "done");
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const completedStages = rows.reduce((n, r) => n + r.completed, 0);
  const progress = rows.length ? completedStages / (rows.length * stageCount) : 0;
  return { rows, running, done, failedCount, progress, start, retryFailed, reset };
}
