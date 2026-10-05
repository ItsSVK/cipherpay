"use client";

import { useCallback, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { readMintRequirements } from "@/lib/chain/activate";
import { buildCompanySetupInstructions } from "@/lib/chain/company";
import { rpc } from "@/lib/chain/rpc";
import { signAndSend } from "@/lib/chain/send";

type Phase = "idle" | "proving" | "signing" | "confirming" | "done" | "error";
const STEP: Record<Phase, number> = { idle: 0, proving: 0, signing: 1, confirming: 2, done: 3, error: 0 };

/** Creates the connected wallet's vault and configures its treasury in one transaction, then refreshes chain state. */
export function useCompanySetup() {
  const keys = useKeys();
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ phase: Phase; error: string | null; signature: string | null }>({ phase: "idle", error: null, signature: null });

  const run = useCallback(async () => {
    const k = keys.getKeys();
    if (!k) return keys.requireKeys();
    if (!signer) return setState({ phase: "error", error: reason ?? "No signer available.", signature: null });
    setState({ phase: "proving", error: null, signature: null });
    try {
      await readMintRequirements(rpc); // fails early and plainly if the mint isn't confidential or isn't on this network
      const instructions = await buildCompanySetupInstructions({ rpc, signer, keys: k, vaultExists: !!chain.vault?.exists });
      setState((s) => ({ ...s, phase: "signing" }));
      const { signature } = await signAndSend({ rpc, signer, instructions, onSigned: () => setState((s) => ({ ...s, phase: "confirming" })) });
      setState({ phase: "done", error: null, signature });
      chain.refresh();
      setTimeout(chain.refresh, 2500);
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : "Setup failed.", signature: null });
    }
  }, [keys, signer, reason, chain]);

  const running = state.phase === "proving" || state.phase === "signing" || state.phase === "confirming";
  return { ...state, completed: STEP[state.phase], running, canSign: !!signer, cannotSignReason: reason, run };
}
