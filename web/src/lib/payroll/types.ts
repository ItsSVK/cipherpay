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

export function shortToday(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/** Where one recipient is in a payroll run. */
export type RecipientStatus = "pending" | "running" | "done" | "failed";

export interface RecipientRun {
  id: string;
  /** Stages finished so far. A retry resumes from here, never from zero. */
  completed: number;
  status: RecipientStatus;
  /** Signature of the pay_employee transaction, set the moment the transfer lands. */
  signature?: string;
  error?: string;
  /** True while this recipient is ready to transfer but another transfer is still in flight. */
  waiting?: boolean;
  /** A short status line, e.g. "Approve in your wallet". */
  note?: string;
  /** When the wallet request currently waiting for approval expires (ms since epoch). Drives a countdown. */
  deadline?: number;
  /** The payment was submitted but not confirmed either way. Check the explorer before retrying. */
  uncertain?: boolean;
  /** The amount encrypted to the recipient, from the payment's proofs (lib/received-amount.ts). Saved with the run. */
  receivedAmount?: string;
}
