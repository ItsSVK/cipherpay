"use client";

import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";
import type { Employee } from "@/lib/mock/data";

/** The connected admin's vault. MOCK: reads the in-memory store; the real one reads the Vault PDA and D1. */
export function useVault() {
  const { address } = useWallet();
  const store = useDemoStore();
  const admin = address ?? "";
  const vault = store.vaultOf(admin);
  return {
    admin,
    vault,
    ready: vault.created && vault.treasuryConfigured,
    isActivated: (wallet: string) => store.accountOf(wallet).activated,
    initialize: () => store.createVault(admin),
    configureTreasury: () => store.configureTreasury(admin),
    fund: (amount: bigint) => store.fundTreasury(admin, amount),
    setPaused: (paused: boolean) => store.setPaused(admin, paused),
    addEmployee: (e: Employee) => store.addEmployee(admin, e),
    pay: (wallet: string, amount: bigint, signature: string, label: string) => store.pay(admin, wallet, amount, signature, label),
    recordRun: (run: Parameters<typeof store.recordRun>[1]) => store.recordRun(admin, run),
  };
}
