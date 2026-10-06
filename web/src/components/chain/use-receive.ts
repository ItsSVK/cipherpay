"use client";

import { address } from "@solana/kit";
import { useCallback, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { deriveHelperSigner } from "@/lib/chain/helper-signer";
import { readConfidentialAccount } from "@/lib/chain/read";
import { buildApplyPendingInstruction } from "@/lib/chain/receive";
import { rpc } from "@/lib/chain/rpc";
import { signAndSend } from "@/lib/chain/send";
import { withdrawOnce, WithdrawError, type WithdrawStage } from "@/lib/chain/withdraw-run";

/** Re-read the chain now and again shortly after, once a transaction has confirmed. */
function refreshSoon(refresh: () => void) {
  refresh();
  setTimeout(refresh, 2500);
}

type ApplyPhase = "idle" | "preparing" | "signing" | "confirming" | "done" | "error";

/** Moves received pay from "pending" into "available": ONE wallet approval of Token-2022's ApplyPendingBalance. */
export function useApplyPending() {
  const keys = useKeys();
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ phase: ApplyPhase; error: string | null; signature: string | null }>({ phase: "idle", error: null, signature: null });

  const run = useCallback(async () => {
    const k = keys.getKeys();
    if (!k) return keys.requireKeys();
    if (!signer) return setState({ phase: "error", error: reason ?? "No signer available.", signature: null });
    setState({ phase: "preparing", error: null, signature: null });
    try {
      // Read fresh: the instruction carries the account's current pending-credit counter, which moves with every payment received.
      const account = await readConfidentialAccount(rpc, address(signer.address));
      if (!account || !account.confidential) throw new Error("Set up your account before applying pay.");
      const instruction = await buildApplyPendingInstruction({ account, keys: k, owner: signer });
      setState((s) => ({ ...s, phase: "signing" }));
      const { signature } = await signAndSend({ rpc, signer, instructions: [instruction], onSigned: () => setState((s) => ({ ...s, phase: "confirming" })) });
      setState({ phase: "done", error: null, signature });
      refreshSoon(chain.refresh);
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : "Could not apply your pending pay.", signature: null });
    }
  }, [keys, signer, reason, chain]);

  const reset = useCallback(() => setState({ phase: "idle", error: null, signature: null }), []);
  const running = state.phase === "preparing" || state.phase === "signing" || state.phase === "confirming";
  return { ...state, running, canSign: !!signer, cannotSignReason: reason, run, reset };
}

type WithdrawPhase = "idle" | "running" | "done" | "error";

/** Cashes out part of the confidential balance: apply pending, prove, withdraw and (optionally) unwrap. See lib/chain/withdraw-run.ts. */
export function useWithdraw() {
  const keys = useKeys();
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ phase: WithdrawPhase; stage: WithdrawStage | null; applied: boolean; error: string | null; maybeSent: boolean; signature: string | null; warning: string | null }>({ phase: "idle", stage: null, applied: false, error: null, maybeSent: false, signature: null, warning: null });

  const run = useCallback(
    async (amount: bigint, unwrap: boolean) => {
      const k = keys.getKeys();
      if (!k) return keys.requireKeys();
      if (!signer) return setState({ phase: "error", stage: null, applied: false, error: reason ?? "No signer available.", maybeSent: false, signature: null, warning: null });
      setState({ phase: "running", stage: "prove", applied: false, error: null, maybeSent: false, signature: null, warning: null });
      try {
        const helper = await deriveHelperSigner(k);
        const result = await withdrawOnce({
          rpc,
          owner: signer,
          helper,
          keys: k,
          amount,
          unwrap,
          onStage: (stage) => setState((s) => ({ ...s, stage, applied: s.applied || stage === "apply" })),
        });
        setState((s) => ({ ...s, phase: "done", stage: null, signature: result.signature, warning: result.closeWarning ?? null }));
        refreshSoon(chain.refresh);
      } catch (e) {
        const maybeSent = e instanceof WithdrawError && e.maybeSent;
        setState((s) => ({ ...s, phase: "error", stage: null, error: e instanceof Error ? e.message : "The withdrawal failed.", maybeSent }));
        refreshSoon(chain.refresh); // an apply that landed before the failure still changed the balances
      }
    },
    [keys, signer, reason, chain],
  );

  const reset = useCallback(() => setState({ phase: "idle", stage: null, applied: false, error: null, maybeSent: false, signature: null, warning: null }), []);
  return { ...state, running: state.phase === "running", canSign: !!signer, cannotSignReason: reason, run, reset };
}
