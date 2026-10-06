"use client";

import { useCallback, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { buildPauseInstruction } from "@/lib/chain/pause";
import { rpc } from "@/lib/chain/rpc";
import { signAndSend } from "@/lib/chain/send";

/**
 * Pauses or resumes payroll on-chain: ONE wallet approval, no keys needed (it is only the admin's signature on a flag flip).
 * Resolves true once the transaction has confirmed, false (with `error` set) if it did not go through.
 */
export function usePausePayroll() {
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const run = useCallback(
    async (paused: boolean): Promise<boolean> => {
      if (!signer) {
        setState({ busy: false, error: reason ?? "No signer available." });
        return false;
      }
      setState({ busy: true, error: null });
      try {
        const instruction = await buildPauseInstruction({ admin: signer, paused });
        await signAndSend({ rpc, signer, instructions: [instruction] });
        setState({ busy: false, error: null });
        chain.refresh();
        setTimeout(chain.refresh, 2500);
        return true;
      } catch (e) {
        setState({ busy: false, error: e instanceof Error ? e.message : "Could not change the payroll status." });
        return false;
      }
    },
    [signer, reason, chain],
  );

  return { ...state, canSign: !!signer, cannotSignReason: reason, run };
}
