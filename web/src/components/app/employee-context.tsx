"use client";

import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";

/** Smallest SOL balance we treat as "can pay network fees" (mock threshold). */
export const MIN_SOL = 5_000_000n;

/** The connected employee's wallet-owned account. MOCK: the real one reads Token-2022 accounts and decrypts locally. */
export function useEmployee() {
  const { address, isDemo } = useWallet();
  const store = useDemoStore();
  const wallet = address ?? "";
  const a = store.accountOf(wallet);
  return {
    wallet,
    ...a,
    // A real wallet's SOL balance is not read yet (chain reads come next), so do not block it on mock data.
    hasSol: !isDemo || a.sol >= MIN_SOL,
    activate: () => store.activate(wallet),
    applyPending: () => store.applyPending(wallet),
    withdraw: (amount: bigint, unwrap: boolean) => store.withdraw(wallet, amount, unwrap),
    airdrop: () => store.airdrop(wallet),
  };
}
