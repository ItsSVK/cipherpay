// Shapes the payroll pages share. Amounts are base units (6 decimals).

export interface Employee {
  id: string;
  name: string;
  role: string;
  wallet: string;
  salary: bigint;
}

/** One line of a payroll: a saved address and what it is paid each run. `id` is the saved address's id. */
export interface PayrollEntry {
  id: string;
  name: string;
  wallet: string;
  amount: bigint;
  /** The saved, sealed amount (`v1.…`) as the database holds it; absent for rows saved before sealing. */
  amountCt?: string | null;
}

/** A named list of who is paid what. The same address can be in several payrolls. */
export interface Payroll {
  id: string;
  name: string;
  entries: PayrollEntry[];
  /** The amounts are encrypted and not opened (keys locked, or they can't be decrypted with this wallet's keys); each `amount` is then 0n, not a real figure. */
  sealed?: boolean;
}

export type RunStatus = "draft" | "pending_approval" | "approved" | "executing" | "done" | "failed";

export interface RunItem {
  wallet: string;
  name: string;
  amount: bigint;
  signature: string;
  /** The amount encrypted to the recipient (lib/received-amount.ts), so the recipient can read this payment. */
  receivedAmount?: string;
}

export interface Run {
  id: string;
  label: string;
  date: string;
  status: RunStatus;
  recipients: number;
  total: bigint;
  items: RunItem[];
  /** Same as `Payroll.sealed`: `total` and item amounts are 0n placeholders. */
  sealed?: boolean;
}

/** Shown where the company needs a name; vaults store none on-chain. */
export const COMPANY_NAME = "Your company";

export interface VaultState {
  name: string;
  created: boolean;
  treasuryConfigured: boolean;
  paused: boolean;
  /** Decrypted treasury balance (the admin's key reads it). */
  treasury: bigint;
  /** Saved addresses (amount is not used here; amounts live in payrolls). */
  employees: Employee[];
  payrolls: Payroll[];
  runs: Run[];
}

export const PIPELINE_STAGES = ["Prove", "Create context", "Verify", "Transfer", "Close"] as const;
/** The stage that actually moves funds. Transfers from one treasury must land one at a time (D3). */
export const TRANSFER_STAGE = 3;

export function shortToday(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
