"use client";

import { useCallback, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { buildActivationInstructions, readMintRequirements } from "@/lib/chain/activate";
import { rpc } from "@/lib/chain/rpc";
import { signAndSend, TxError } from "@/lib/chain/send";

type Phase = "idle" | "proving" | "signing" | "confirming" | "done" | "error";

/** Which of the three activation steps is current, for the step list. */
const STEP: Record<Phase, number> = { idle: 0, proving: 0, signing: 1, confirming: 2, done: 3, error: 0 };

/**
 * The real activation: prove the key, ask the wallet to sign one transaction, wait for it to confirm, then
 * refresh chain state so the page switches to the activated view.
 */
export function useActivation() {
  const keys = useKeys();
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ phase: Phase; error: string | null; signature: string | null; needsApproval: boolean }>({ phase: "idle", error: null, signature: null, needsApproval: false });

  const run = useCallback(async () => {
    const k = keys.getKeys();
    if (!k) return keys.requireKeys();
    if (!signer) return setState({ phase: "error", error: reason ?? "No signer available.", signature: null, needsApproval: false });
    setState({ phase: "proving", error: null, signature: null, needsApproval: false });
    try {
      const mint = await readMintRequirements(rpc);
      const instructions = await buildActivationInstructions({ rpc, signer, keys: k });
      setState((s) => ({ ...s, phase: "signing" }));
      const { signature } = await signAndSend({ rpc, signer, instructions, onSigned: () => setState((s) => ({ ...s, phase: "confirming" })) });
      setState({ phase: "done", error: null, signature, needsApproval: !mint.autoApproveNewAccounts });
      chain.refresh();
      setTimeout(chain.refresh, 2500);
    } catch (e) {
      setState({ phase: "error", error: e instanceof TxError || e instanceof Error ? e.message : "Activation failed.", signature: null, needsApproval: false });
    }
  }, [keys, signer, reason, chain]);

  const running = state.phase === "proving" || state.phase === "signing" || state.phase === "confirming";
  return { ...state, completed: STEP[state.phase], running, canSign: !!signer, cannotSignReason: reason, run };
}
