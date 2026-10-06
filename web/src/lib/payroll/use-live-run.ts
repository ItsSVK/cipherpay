"use client";

import { address } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { deriveHelperSigner, ensureHelperReady } from "@/lib/chain/helper-signer";
import { PaymentError, payOne, type PayStage } from "@/lib/chain/pay-run";
import { rpc } from "@/lib/chain/rpc";
import type { RecipientRun } from "./use-run-simulation";

export interface LiveItem {
  id: string;
  name: string;
  wallet: string;
  /** Base units. */
  amount: bigint;
}

/** Stations on the progress track a stage maps to ("Prove", "Create context", "Verify", "Transfer", "Close"). */
const STAGE_INDEX: Record<PayStage, number> = { prove: 0, create: 1, verify: 2, transfer: 3, close: 4 };

/**
 * The real payout engine: pays each recipient in turn through pay_employee. Recipients are strictly sequential, which is
 * exactly what the protocol needs, since each equality proof is built against the treasury's current balance ciphertext
 * and so payment N must land before payment N+1 is proved. The wallet approves at most ONCE per run (it authorizes the
 * payroll helper key as the vault's operator and tops it up with a little SOL); every transaction of every payment is then signed by the helper.
 * Same return shape as the demo engine (`useRunSimulation`), so the payroll page can use either.
 */
export function useLiveRun(items: LiveItem[], stageCount: number) {
  const keys = useKeys();
  const { signer } = useTxSigner();
  const chain = useChain();
  const idsKey = items.map((i) => i.id).join("|");
  const initial = useCallback((key: string): RecipientRun[] => key.split("|").filter(Boolean).map((id) => ({ id, completed: 0, status: "pending" })), []);

  const [state, setState] = useState<{ key: string; rows: RecipientRun[] }>(() => ({ key: idsKey, rows: initial(idsKey) }));
  const [running, setRunning] = useState(false);
  const rowsRef = useRef<RecipientRun[]>([]);
  const itemsRef = useRef(items);
  const alive = useRef(true);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rows = state.key === idsKey ? state.rows : initial(idsKey);

  const commit = useCallback(
    (next: RecipientRun[]) => {
      rowsRef.current = next;
      if (alive.current) setState({ key: idsKey, rows: next });
    },
    [idsKey],
  );
  const patch = useCallback(
    (id: string, change: Partial<RecipientRun>) => {
      commit(rowsRef.current.map((r) => (r.id === id ? { ...r, ...change } : r)));
    },
    [commit],
  );

  const runIds = useCallback(
    async (ids: string[]) => {
      const k = keys.getKeys();
      if (!k) return keys.requireKeys();
      if (!signer) return;
      setRunning(true);
      const helper = await deriveHelperSigner(k);
      // ONE wallet approval for the whole run, and none while a recent authorization is live: it tops the helper up with SOL if short
      // and authorizes it to pay as the vault's operator. After that every payment is signed by the helper, with no popup.
      const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);
      const shortHelper = `${helper.address.slice(0, 4)}…${helper.address.slice(-4)}`;
      let what = { topUpLamports: 0n, authorize: false };
      const first = ids[0];
      try {
        await ensureHelperReady({
          rpc,
          admin: signer,
          helper,
          onNeedApproval: (w) => {
            what = w;
          },
          onPrompt: ({ attempt, expiresAtMs }) =>
            first &&
            patch(first, {
              status: "running",
              deadline: expiresAtMs,
              note: `${attempt > 0 ? "That took longer than devnet allows, so we're asking again. " : ""}Your wallet will show one transaction${what.topUpLamports > 0n ? `: a SOL transfer of ${sol(what.topUpLamports)} SOL to your payroll helper (${shortHelper}), which pays the rent for the temporary proof accounts` : ""}${what.authorize ? `${what.topUpLamports > 0n ? ", plus" : ":"} a Cipherpay call that lets the helper pay employees for the next hour (it can't do anything else)` : ""}. After this, payments need no more approvals.`,
            }),
          onSigned: () => first && patch(first, { deadline: undefined, note: undefined }),
        });
      } catch (e) {
        for (const id of ids) patch(id, { status: "failed", error: `Couldn't authorize payroll: ${e instanceof Error ? e.message : "The approval failed."}`, uncertain: false, note: undefined, deadline: undefined });
        if (alive.current) setRunning(false);
        return;
      }
      for (const id of ids) {
        const item = itemsRef.current.find((i) => i.id === id);
        if (!item || !alive.current) continue;
        patch(id, { status: "running", completed: 0, error: undefined, uncertain: false, note: undefined, deadline: undefined });
        try {
          const result = await payOne({
            rpc,
            admin: address(signer.address),
            helper,
            keys: k,
            employee: address(item.wallet),
            amount: item.amount,
            onStage: (stage) => patch(id, { completed: STAGE_INDEX[stage], note: undefined }),
          });
          patch(id, { status: "done", completed: stageCount, signature: result.signature, note: result.closeWarning });
        } catch (e) {
          const maybePaid = e instanceof PaymentError && e.maybePaid;
          patch(id, {
            status: "failed",
            error: maybePaid ? `${e instanceof Error ? e.message : "Unknown error."} This payment may have gone through. Check the treasury and the explorer before retrying.` : e instanceof Error ? e.message : "The payment failed.",
            uncertain: maybePaid,
            note: undefined,
            deadline: undefined,
          });
        }
      }
      if (alive.current) setRunning(false);
      chain.refresh();
    },
    [keys, signer, patch, stageCount, chain],
  );

  const start = useCallback(() => {
    commit(initial(idsKey));
    void runIds(idsKey.split("|").filter(Boolean));
  }, [commit, initial, idsKey, runIds]);

  /** Re-runs only the failed recipients. Recipients that already confirmed are never touched. */
  const retryFailed = useCallback(() => {
    void runIds(rowsRef.current.filter((r) => r.status === "failed").map((r) => r.id));
  }, [runIds]);

  const reset = useCallback(() => {
    commit(initial(idsKey));
    setRunning(false);
  }, [commit, initial, idsKey]);

  const done = rows.length > 0 && rows.every((r) => r.status === "done");
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const completedStages = rows.reduce((n, r) => n + r.completed, 0);
  const progress = rows.length ? completedStages / (rows.length * stageCount) : 0;
  return { rows, running, done, failedCount, progress, start, retryFailed, reset, canSign: !!signer };
}
