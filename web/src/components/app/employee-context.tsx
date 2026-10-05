"use client";

import { useChain } from "@/components/chain/chain-state";
import { useConfidentialBalance, type BalanceStatus } from "@/components/chain/use-confidential-balance";
import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";

/** Smallest SOL balance we treat as "can pay network fees" for a few transactions (0.01 SOL). */
export const MIN_SOL = 10_000_000n;

/**
 * Account status that needs no keys, so the shell can use it. Demo wallets read the mock store; real
 * wallets read devnet. For a real wallet the "new pay waiting" dot is unknown without keys, so it is off.
 */
export function useAccountStatus() {
  const { address, isDemo } = useWallet();
  const store = useDemoStore();
  const chain = useChain();
  if (isDemo) {
    const a = store.accountOf(address ?? "");
    return { loading: false, live: false, activated: a.activated, awaitingApproval: false, sol: a.sol, pendingBadge: a.pending > 0n };
  }
  const acct = chain.wallet?.wusdc ?? null;
  return { loading: chain.loading, live: true, activated: !!acct?.confidential, awaitingApproval: !!acct?.confidential && !acct.approved, sol: chain.wallet?.sol ?? 0n, pendingBadge: false };
}

/** The connected wallet's own account (the personal side of the app). Needs the key provider to decrypt balances. */
export function useEmployee() {
  const { address, isDemo } = useWallet();
  const store = useDemoStore();
  const chain = useChain();
  const status = useAccountStatus();
  const decrypted = useConfidentialBalance(isDemo ? null : (chain.wallet?.wusdc ?? null));
  const wallet = address ?? "";

  const actions = {
    activate: () => store.activate(wallet),
    applyPending: () => store.applyPending(wallet),
    withdraw: (amount: bigint, unwrap: boolean) => store.withdraw(wallet, amount, unwrap),
    airdrop: () => store.airdrop(wallet),
  };

  if (isDemo) {
    const a = store.accountOf(wallet);
    return { wallet, ...a, ...actions, isLive: false, loading: false, awaitingApproval: false, hasSol: a.sol >= MIN_SOL, balanceStatus: "ready" as BalanceStatus, balanceError: null as string | null };
  }

  const w = chain.wallet;
  return {
    wallet,
    ...actions,
    isLive: true,
    loading: status.loading,
    activated: status.activated,
    awaitingApproval: status.awaitingApproval,
    sol: status.sol,
    hasSol: status.sol >= MIN_SOL,
    // Zero until the keys are unlocked and the ciphertexts decrypt; pages gate display on balanceStatus.
    pending: decrypted.balance?.pending ?? 0n,
    available: decrypted.balance?.available ?? 0n,
    publicWusdc: w?.wusdc?.publicBalance ?? 0n,
    publicUsdc: w?.usdc ?? 0n,
    payments: [] as { id: string; date: string; from: string; amount: bigint; status: "pending" | "available"; signature: string }[],
    balanceStatus: decrypted.status,
    balanceError: decrypted.error,
  };
}
