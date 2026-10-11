"use client";

import { useChain } from "@/components/chain/chain-state";
import { useKeys } from "@/components/crypto/key-context";
import { usePayrollData } from "@/components/data/payroll-data";
import { useOpenRecords } from "@/components/data/use-open-records";
import { useConfidentialBalance, type BalanceStatus } from "@/components/chain/use-confidential-balance";
import { usePausePayroll } from "@/components/chain/use-pause-payroll";
import { useWallet } from "@/components/wallet/wallet-context";
import { recordKeyFor, sealAmount } from "@/lib/crypto/record-seal";
import { amountContext } from "@/lib/sealed-amount";
import { cipherPreview } from "@/lib/format";
import { VAULT_PROGRAM_ADDRESS } from "@/lib/chain/constants";
import { COMPANY_NAME, type Payroll, type Run, type VaultState } from "@/lib/payroll/types";

/** Company status that needs no keys, so the shell can use it. Read from the wallet's vault PDA. */
export function useCompanyStatus() {
  const chain = useChain();
  const v = chain.vault;
  return { loading: chain.loading, created: !!v?.exists, treasuryConfigured: !!v?.treasuryConfigured, paused: !!v?.paused, ready: !!v?.exists && !!v.treasuryConfigured };
}

/**
 * The connected admin's vault. Vault flags and the treasury balance come from the chain; saved addresses, payrolls
 * and run history from the database (D1). Needs the key provider to decrypt.
 */
export function useVault() {
  const { address } = useWallet();
  const chain = useChain();
  const status = useCompanyStatus();
  const data = usePayrollData();
  const keys = useKeys();
  const pause = usePausePayroll();
  const treasury = useConfidentialBalance(chain.vault?.treasury ?? null);
  const admin = address ?? "";
  // Payroll and run amounts are stored encrypted for this wallet; they are readable here only while the keys are unlocked.
  const records = useOpenRecords(admin, true);

  /** The key that seals amounts before they are saved. Asks for the keys (opens the unlock dialog) if they are locked. */
  const recordKey = () => {
    const k = keys.getKeys();
    if (!k) {
      keys.requireKeys();
      throw new Error("Unlock your keys first: amounts are encrypted with them before they are saved.");
    }
    return recordKeyFor(k);
  };

  const vault: VaultState = { name: COMPANY_NAME, created: status.created, treasuryConfigured: status.treasuryConfigured, paused: status.paused, treasury: treasury.balance?.available ?? 0n, employees: data.employees, payrolls: records.payrolls, runs: records.runs };

  const treasuryExt = chain.vault?.treasury?.confidential && chain.vault.treasury.token.extensions.__option === "Some"
    ? chain.vault.treasury.token.extensions.value.find((e) => e.__kind === "ConfidentialTransferAccount")
    : undefined;
  /** First 5 hex digits, prefixed `0x` so it cannot be mistaken for a number, of the treasury's REAL on-chain available-balance ciphertext; undefined for an unconfigured treasury. */
  const treasuryCipherHex =
    treasuryExt && treasuryExt.__kind === "ConfidentialTransferAccount" ? cipherPreview(treasuryExt.availableBalance as unknown as ArrayLike<number>) : undefined;

  return {
    admin,
    vault,
    treasuryCipherHex,
    /** This company's vault account (the program id as a stand-in until the chain has been read). */
    vaultAddress: chain.vault?.address ?? VAULT_PROGRAM_ADDRESS,
    ready: status.ready,
    loading: status.loading,
    /** Whether payroll and run amounts are readable: "locked" until the keys are unlocked. */
    recordsStatus: records.status,
    /** How many saved amounts could not be decrypted with this wallet's keys (changed, or saved under different keys). */
    recordsUnreadable: records.unreadable,
    /** Whether the treasury balance can be shown: decrypted while the keys are unlocked. */
    treasuryStatus: treasury.status as BalanceStatus,
    treasuryError: treasury.error,
    treasuryPending: treasury.balance?.pending ?? 0n,
    isActivated: (wallet: string) => !!chain.activation[wallet],
    /** Sends `pause_payroll` / `resume_payroll` (one wallet approval) and resolves true once it confirms. */
    setPaused: (paused: boolean): Promise<boolean> => pause.run(paused),
    /** True while a real pause / resume is waiting on the wallet or the network. */
    pauseBusy: pause.busy,
    pauseError: pause.error,
    /** Saves to the database (and may reject: duplicate address, signed out). */
    addAddress: (a: { name: string; wallet: string }): Promise<void> => data.addAddress(a),
    removeAddress: (id: string): Promise<void> => data.removeAddress(id),
    /** Seals the amounts and saves to the database. Resolves to the saved payroll. */
    addPayroll: async (p: { name: string; entries: { addressId: string; amount: bigint }[] }): Promise<Payroll> => {
      if (p.entries.some((e) => e.amount <= 0n)) throw new Error("Every amount must be above zero.");
      const key = await recordKey();
      // The id is chosen here because each amount is sealed to (this wallet, this payroll, this address) before it is sent.
      const id = crypto.randomUUID();
      const entries = await Promise.all(p.entries.map(async (e) => ({ addressId: e.addressId, amountCt: await sealAmount(key, e.amount, amountContext.payrollEntry(admin, id, e.addressId)) })));
      const created = await data.addPayroll({ id, name: p.name, entries });
      const amounts = new Map(p.entries.map((e) => [e.addressId, e.amount]));
      return { id: created.id, name: created.name, entries: created.entries.map((e) => ({ id: e.addressId, name: e.name, wallet: e.wallet, amount: amounts.get(e.addressId) ?? 0n })) };
    },
    removePayroll: (id: string): Promise<void> => data.removePayroll(id),
    recordRun: async (run: Run, payrollId?: string | null): Promise<void> => {
      const key = await recordKey();
      // The id is chosen here because the total and each item are sealed to (this wallet, this run) before they are sent.
      const id = crypto.randomUUID();
      const items = await Promise.all(
        run.items.map(async (i) => ({ wallet: i.wallet, name: i.name, amountCt: await sealAmount(key, i.amount, amountContext.runItem(admin, id, i.wallet)), signature: i.signature, receivedAmountCt: i.receivedAmount ?? null, status: "confirmed" as const })),
      );
      const total = run.items.reduce((n, i) => n + i.amount, 0n);
      await data.recordRun({ id, label: run.label, payrollId: payrollId ?? null, totalCt: await sealAmount(key, total, amountContext.runTotal(admin, id)), items });
    },
  };
}
