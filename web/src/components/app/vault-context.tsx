"use client";

import { useChain } from "@/components/chain/chain-state";
import { usePayrollData } from "@/components/data/payroll-data";
import { useConfidentialBalance, type BalanceStatus } from "@/components/chain/use-confidential-balance";
import { usePausePayroll } from "@/components/chain/use-pause-payroll";
import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";
import { VAULT_ADDRESS, type Employee, type VaultState } from "@/lib/mock/data";

/** Company status that needs no keys, so the shell can use it. Demo reads the mock store; a real wallet reads its vault PDA. */
export function useCompanyStatus() {
  const { address, isDemo } = useWallet();
  const store = useDemoStore();
  const chain = useChain();
  if (isDemo) {
    const v = store.vaultOf(address ?? "");
    return { loading: false, created: v.created, treasuryConfigured: v.treasuryConfigured, paused: v.paused, ready: v.created && v.treasuryConfigured };
  }
  const v = chain.vault;
  return { loading: chain.loading, created: !!v?.exists, treasuryConfigured: !!v?.treasuryConfigured, paused: !!v?.paused, ready: !!v?.exists && !!v.treasuryConfigured };
}

/**
 * The connected admin's vault. Vault flags and the treasury balance are real for a real wallet. The employee
 * list and run history are still the in-memory mock (they become D1 later). Needs the key provider to decrypt.
 */
export function useVault() {
  const { address, isDemo } = useWallet();
  const store = useDemoStore();
  const chain = useChain();
  const status = useCompanyStatus();
  const data = usePayrollData();
  const pause = usePausePayroll();
  const treasury = useConfidentialBalance(isDemo ? null : (chain.vault?.treasury ?? null));
  const admin = address ?? "";
  const mock = store.vaultOf(admin);

  const vault: VaultState = isDemo
    ? mock
    : { ...mock, created: status.created, treasuryConfigured: status.treasuryConfigured, paused: status.paused, treasury: treasury.balance?.available ?? 0n, employees: data.employees, runs: data.runs };

  return {
    admin,
    vault,
    /** This company's vault account: the real PDA for a real wallet (the demo shows the program id as a stand-in). */
    vaultAddress: isDemo ? VAULT_ADDRESS : (chain.vault?.address ?? VAULT_ADDRESS),
    ready: status.ready,
    loading: status.loading,
    isLive: !isDemo,
    /** Whether the treasury balance can be shown: always true for demo, decrypted and unlocked for a real wallet. */
    treasuryStatus: (isDemo ? "ready" : treasury.status) as BalanceStatus,
    treasuryError: isDemo ? null : treasury.error,
    treasuryPending: isDemo ? 0n : (treasury.balance?.pending ?? 0n),
    isActivated: (wallet: string) => (isDemo ? store.accountOf(wallet).activated : !!chain.activation[wallet]),
    initialize: () => store.createVault(admin),
    configureTreasury: () => store.configureTreasury(admin),
    fund: (amount: bigint) => store.fundTreasury(admin, amount),
    /** Resolves true when the change took effect. Real wallets send `pause_payroll` / `resume_payroll` (one wallet approval) and resolve once it confirms. */
    setPaused: async (paused: boolean): Promise<boolean> => {
      if (isDemo) {
        store.setPaused(admin, paused);
        return true;
      }
      return pause.run(paused);
    },
    /** True while a real pause / resume is waiting on the wallet or the network. */
    pauseBusy: pause.busy,
    pauseError: pause.error,
    /** Real wallets save to the database (and may reject: duplicate wallet, signed out). Demo wallets use the in-memory list. */
    addEmployee: async (e: Employee): Promise<void> => {
      if (isDemo) store.addEmployee(admin, e);
      else await data.addEmployee({ name: e.name, role: e.role, wallet: e.wallet, salary: e.salary });
    },
    removeEmployee: async (id: string): Promise<void> => {
      if (isDemo) store.removeEmployee(admin, id);
      else await data.removeEmployee(id);
    },
    pay: (wallet: string, amount: bigint, signature: string, label: string) => store.pay(admin, wallet, amount, signature, label),
    recordRun: async (run: Parameters<typeof store.recordRun>[1]): Promise<void> => {
      if (isDemo) store.recordRun(admin, run);
      else await data.recordRun(run.label, run.items.map((i) => ({ wallet: i.wallet, name: i.name, amount: i.amount, signature: i.signature, status: "confirmed" as const })));
    },
  };
}
