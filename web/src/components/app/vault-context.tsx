"use client";

import { useChain } from "@/components/chain/chain-state";
import { useKeys } from "@/components/crypto/key-context";
import { usePayrollData } from "@/components/data/payroll-data";
import { useOpenRecords } from "@/components/data/use-open-records";
import { useConfidentialBalance, type BalanceStatus } from "@/components/chain/use-confidential-balance";
import { usePausePayroll } from "@/components/chain/use-pause-payroll";
import { useWallet } from "@/components/wallet/wallet-context";
import { recordKeyFor, sealAmount } from "@/lib/crypto/record-seal";
import { useDemoStore } from "@/lib/mock/store";
import { amountContext } from "@/lib/sealed-amount";
import { VAULT_ADDRESS, type Payroll, type VaultState } from "@/lib/mock/data";

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
  const keys = useKeys();
  const pause = usePausePayroll();
  const treasury = useConfidentialBalance(isDemo ? null : (chain.vault?.treasury ?? null));
  const admin = address ?? "";
  const mock = store.vaultOf(admin);
  // Payroll and run amounts are stored encrypted for this wallet; they are readable here only while the keys are unlocked.
  const records = useOpenRecords(admin, !isDemo);

  /** The key that seals amounts before they are saved. Asks for the keys (opens the unlock dialog) if they are locked. */
  const recordKey = () => {
    const k = keys.getKeys();
    if (!k) {
      keys.requireKeys();
      throw new Error("Unlock your keys first: amounts are encrypted with them before they are saved.");
    }
    return recordKeyFor(k);
  };

  const vault: VaultState = isDemo
    ? mock
    : { ...mock, created: status.created, treasuryConfigured: status.treasuryConfigured, paused: status.paused, treasury: treasury.balance?.available ?? 0n, employees: data.employees, payrolls: records.payrolls, runs: records.runs };

  const treasuryExt = !isDemo && chain.vault?.treasury?.confidential && chain.vault.treasury.token.extensions.__option === "Some"
    ? chain.vault.treasury.token.extensions.value.find((e) => e.__kind === "ConfidentialTransferAccount")
    : undefined;
  /** First 5 hex digits, prefixed `0x` so it cannot be mistaken for a number, of the treasury's REAL on-chain available-balance ciphertext; undefined for demo wallets or an unconfigured treasury. */
  const treasuryCipherHex =
    treasuryExt && treasuryExt.__kind === "ConfidentialTransferAccount"
      ? `0x${Array.from(treasuryExt.availableBalance as unknown as ArrayLike<number>).slice(0, 3).map((n: number) => n.toString(16).padStart(2, "0")).join("").slice(0, 5)}`
      : undefined;

  return {
    admin,
    vault,
    treasuryCipherHex,
    /** This company's vault account: the real PDA for a real wallet (the demo shows the program id as a stand-in). */
    vaultAddress: isDemo ? VAULT_ADDRESS : (chain.vault?.address ?? VAULT_ADDRESS),
    ready: status.ready,
    loading: status.loading,
    isLive: !isDemo,
    /** Whether payroll and run amounts are readable: always "open" for demo; for a real wallet "locked" until the keys are unlocked. */
    recordsStatus: isDemo ? ("open" as const) : records.status,
    /** How many saved amounts could not be decrypted with this wallet's keys (changed, or saved under different keys). */
    recordsUnreadable: isDemo ? 0 : records.unreadable,
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
    /** Real wallets save to the database (and may reject: duplicate address, signed out). Demo wallets use the in-memory list. */
    addAddress: async (a: { name: string; wallet: string }): Promise<void> => {
      if (isDemo) store.addEmployee(admin, { id: crypto.randomUUID(), name: a.name, role: "", wallet: a.wallet, salary: 0n });
      else await data.addAddress(a);
    },
    removeAddress: async (id: string): Promise<void> => {
      if (isDemo) store.removeEmployee(admin, id);
      else await data.removeAddress(id);
    },
    /** Real wallets save to the database; demo wallets use the in-memory list. Resolves to the saved payroll. */
    addPayroll: async (p: { name: string; entries: { addressId: string; amount: bigint }[] }): Promise<Payroll> => {
      if (!isDemo) {
        if (p.entries.some((e) => e.amount <= 0n)) throw new Error("Every amount must be above zero.");
        const key = await recordKey();
        // The id is chosen here because each amount is sealed to (this wallet, this payroll, this address) before it is sent.
        const id = crypto.randomUUID();
        const entries = await Promise.all(p.entries.map(async (e) => ({ addressId: e.addressId, amountCt: await sealAmount(key, e.amount, amountContext.payrollEntry(admin, id, e.addressId)) })));
        const created = await data.addPayroll({ id, name: p.name, entries });
        const amounts = new Map(p.entries.map((e) => [e.addressId, e.amount]));
        return { id: created.id, name: created.name, entries: created.entries.map((e) => ({ id: e.addressId, name: e.name, wallet: e.wallet, amount: amounts.get(e.addressId) ?? 0n })) };
      }
      const known = new Map(mock.employees.map((e) => [e.id, e]));
      const payroll: Payroll = { id: crypto.randomUUID(), name: p.name, entries: p.entries.flatMap((e) => { const a = known.get(e.addressId); return a ? [{ id: a.id, name: a.name, wallet: a.wallet, amount: e.amount }] : []; }) };
      store.addPayroll(admin, payroll);
      return payroll;
    },
    removePayroll: async (id: string): Promise<void> => {
      if (isDemo) store.removePayroll(admin, id);
      else await data.removePayroll(id);
    },
    pay: (wallet: string, amount: bigint, signature: string, label: string) => store.pay(admin, wallet, amount, signature, label),
    recordRun: async (run: Parameters<typeof store.recordRun>[1], payrollId?: string | null): Promise<void> => {
      if (isDemo) {
        store.recordRun(admin, run);
        return;
      }
      const key = await recordKey();
      // The id is chosen here because the total and each item are sealed to (this wallet, this run) before they are sent.
      const id = crypto.randomUUID();
      const items = await Promise.all(
        run.items.map(async (i) => ({ wallet: i.wallet, name: i.name, amountCt: await sealAmount(key, i.amount, amountContext.runItem(admin, id, i.wallet)), signature: i.signature, status: "confirmed" as const })),
      );
      const total = run.items.reduce((n, i) => n + i.amount, 0n);
      await data.recordRun({ id, label: run.label, payrollId: payrollId ?? null, totalCt: await sealAmount(key, total, amountContext.runTotal(admin, id)), items });
    },
  };
}
