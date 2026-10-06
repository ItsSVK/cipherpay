"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { emptyAccount, newVault, seedAccounts, seedVaults, SOL, type Account, type Employee, type Run, type VaultState } from "./data";

/**
 * MOCK backend: stands in for D1 (employee lists, run history) and for on-chain reads (balances,
 * activation, paused flag). Everything is in memory and resets on a full page reload.
 * The action names mirror the real instructions so wiring them up later is a swap, not a redesign.
 */
interface Store {
  vaults: Record<string, VaultState>;
  accounts: Record<string, Account>;
  vaultOf: (admin: string) => VaultState;
  accountOf: (wallet: string) => Account;
  /** initialize_vault */
  createVault: (admin: string) => void;
  /** configure_treasury_account */
  configureTreasury: (admin: string) => void;
  /** wrap -> fund_treasury -> deposit_confidential -> apply_treasury_pending */
  fundTreasury: (admin: string, amount: bigint) => void;
  /** pause_payroll / resume_payroll */
  setPaused: (admin: string, paused: boolean) => void;
  addEmployee: (admin: string, employee: Employee) => void;
  removeEmployee: (admin: string, id: string) => void;
  /** pay_employee, once per recipient: moves value from the treasury to the recipient's pending balance. */
  pay: (admin: string, wallet: string, amount: bigint, signature: string, label: string) => void;
  recordRun: (admin: string, run: Run) => void;
  /** create_confidential_account */
  activate: (wallet: string) => void;
  /** Token-2022 ApplyPendingBalance */
  applyPending: (wallet: string) => void;
  /** withdraw_confidential, then optionally unwrap_confidential */
  withdraw: (wallet: string, amount: bigint, unwrap: boolean) => void;
  airdrop: (wallet: string) => void;
}

const Ctx = createContext<Store | null>(null);
const EMPTY_VAULT = newVault();

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [vaults, setVaults] = useState<Record<string, VaultState>>(seedVaults);
  const [accounts, setAccounts] = useState<Record<string, Account>>(seedAccounts);

  const patchVault = useCallback((admin: string, fn: (v: VaultState) => VaultState) => {
    setVaults((all) => ({ ...all, [admin]: fn(all[admin] ?? newVault()) }));
  }, []);
  const patchAccount = useCallback((wallet: string, fn: (a: Account) => Account) => {
    setAccounts((all) => ({ ...all, [wallet]: fn(all[wallet] ?? emptyAccount()) }));
  }, []);

  const store = useMemo<Store>(
    () => ({
      vaults,
      accounts,
      vaultOf: (admin) => vaults[admin] ?? EMPTY_VAULT,
      accountOf: (wallet) => accounts[wallet] ?? emptyAccount(),
      createVault: (admin) => patchVault(admin, (v) => ({ ...v, created: true })),
      configureTreasury: (admin) => patchVault(admin, (v) => ({ ...v, treasuryConfigured: true })),
      fundTreasury: (admin, amount) => patchVault(admin, (v) => ({ ...v, treasury: v.treasury + amount })),
      setPaused: (admin, paused) => patchVault(admin, (v) => ({ ...v, paused })),
      addEmployee: (admin, employee) => patchVault(admin, (v) => ({ ...v, employees: [employee, ...v.employees] })),
      removeEmployee: (admin, id) => patchVault(admin, (v) => ({ ...v, employees: v.employees.filter((e) => e.id !== id) })),
      pay: (admin, wallet, amount, signature, label) => {
        patchVault(admin, (v) => ({ ...v, treasury: v.treasury - amount }));
        patchAccount(wallet, (a) => ({
          ...a,
          pending: a.pending + amount,
          payments: [{ id: `${signature}:${wallet}`, date: shortToday(), from: label, amount, status: "pending", signature }, ...a.payments],
        }));
      },
      recordRun: (admin, run) => patchVault(admin, (v) => ({ ...v, runs: [run, ...v.runs] })),
      activate: (wallet) => patchAccount(wallet, (a) => ({ ...a, activated: true })),
      applyPending: (wallet) =>
        patchAccount(wallet, (a) => ({
          ...a,
          available: a.available + a.pending,
          pending: 0n,
          payments: a.payments.map((p) => ({ ...p, status: "available" as const })),
        })),
      withdraw: (wallet, amount, unwrap) =>
        patchAccount(wallet, (a) => ({
          ...a,
          available: a.available - amount,
          publicWusdc: unwrap ? a.publicWusdc : a.publicWusdc + amount,
          publicUsdc: unwrap ? a.publicUsdc + amount : a.publicUsdc,
        })),
      airdrop: (wallet) => patchAccount(wallet, (a) => ({ ...a, sol: a.sol + SOL(1) })),
    }),
    [vaults, accounts, patchVault, patchAccount],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useDemoStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemoStore must be used inside <DemoStoreProvider>");
  return ctx;
}

export function shortToday(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
