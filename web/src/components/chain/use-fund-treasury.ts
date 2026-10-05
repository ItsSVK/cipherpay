"use client";

import { address } from "@solana/kit";
import { useCallback, useState } from "react";
import { useChain } from "@/components/chain/chain-state";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { decryptAccountBalance } from "@/lib/chain/decrypt";
import { buildFundTreasuryInstructions, snapshotTreasury } from "@/lib/chain/fund";
import { readVaultState, readWalletState } from "@/lib/chain/read";
import { rpc } from "@/lib/chain/rpc";
import { signAndSend } from "@/lib/chain/send";
import { formatUsdc } from "@/lib/format";

type Phase = "idle" | "preparing" | "signing" | "confirming" | "done" | "error";
// The sheet shows four steps: prepare, approve, then the public half and the encrypted half of the on-chain transaction.
const STEP: Record<Phase, number> = { idle: 0, preparing: 0, signing: 1, confirming: 2, done: 4, error: 0 };

export const USDC_FAUCET_URL = "https://faucet.circle.com";

/** Wraps USDC, moves it into the treasury, deposits it confidentially and applies it, in one transaction. */
export function useFundTreasury() {
  const keys = useKeys();
  const { signer, reason } = useTxSigner();
  const chain = useChain();
  const [state, setState] = useState<{ phase: Phase; error: string | null; signature: string | null }>({ phase: "idle", error: null, signature: null });

  const run = useCallback(
    async (amount: bigint) => {
      const k = keys.getKeys();
      if (!k) return keys.requireKeys();
      if (!signer) return setState({ phase: "error", error: reason ?? "No signer available.", signature: null });
      setState({ phase: "preparing", error: null, signature: null });
      try {
        // Read fresh state: the treasury's pending-credit counter and balance must be current for the apply step.
        const owner = address(signer.address);
        const [wallet, vault] = await Promise.all([readWalletState(rpc, owner), readVaultState(rpc, owner)]);
        if (!vault.exists || !vault.treasuryConfigured || !vault.treasury) throw new Error("Set up your company before funding the treasury.");
        if (wallet.usdc < amount) {
          throw new Error(
            wallet.usdc === 0n
              ? "This wallet has no devnet USDC. Get some from Circle's faucet (choose Solana Devnet), then try again."
              : `You have ${formatUsdc(wallet.usdc)} devnet USDC, which is less than ${formatUsdc(amount)}.`,
          );
        }
        const balance = await decryptAccountBalance(vault.treasury, k);
        const instructions = await buildFundTreasuryInstructions({ signer, keys: k, amount, treasury: snapshotTreasury(vault.treasury, balance) });
        setState((s) => ({ ...s, phase: "signing" }));
        const { signature } = await signAndSend({ rpc, signer, instructions, onSigned: () => setState((s) => ({ ...s, phase: "confirming" })) });
        setState({ phase: "done", error: null, signature });
        chain.refresh();
        setTimeout(chain.refresh, 2500);
      } catch (e) {
        setState({ phase: "error", error: e instanceof Error ? e.message : "Funding failed.", signature: null });
      }
    },
    [keys, signer, reason, chain],
  );

  const reset = useCallback(() => setState({ phase: "idle", error: null, signature: null }), []);
  const running = state.phase === "preparing" || state.phase === "signing" || state.phase === "confirming";
  return { ...state, completed: STEP[state.phase], running, canSign: !!signer, cannotSignReason: reason, run, reset };
}
