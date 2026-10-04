// MOCK DATA for the UI pass. Replace with D1 + on-chain reads. Amounts are base units (6 decimals).
import { hashString, seededRandom } from "@/lib/format";

export const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));
export const SOL = (n: number) => BigInt(Math.round(n * 1_000_000_000));

export interface Employee {
  id: string;
  name: string;
  role: string;
  wallet: string;
  salary: bigint;
}

export const ADMIN_WALLET = "8xQf2nPLtGZ4wVhKd6YbJ3sRcA9mTe1uXoHvN5zWkP7q";
export const NEW_COMPANY_WALLET = "N3wCo4pAnYWa11etK7mQxZ9VcLbT2nRhJdE5uFgS8yPv";
export const AUDITOR_WALLET = "Aud1tR4kLm9XcVb2nQzW7sHjT5yPeUo3dFgK8vNxC6aZ";
export const TAX_WALLET = "TaxR3serveAcme8LabsWa11etXk2mQp9VcZ5nHbT7yJdE";
/** Demo-only wallet standing in for a platform fee destination. */
export const FEE_WALLET = "P1atf0rmFeeWa11etR4kLm9XcVb2nQzW7sHjT5yPeUo3";
export const VAULT_ADDRESS = "ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48";

export const TREASURY_BALANCE = usdc(184_250);

export const EMPLOYEES: Employee[] = [
  { id: "e1", name: "Sam Okafor", role: "Contractor", wallet: "3kT9bWmQe7YxHn2VcLpR5aZsD8uFj4gNoK6tXyP1vBqE", salary: usdc(10_000) },
  { id: "e2", name: "Priya Nair", role: "Finance lead", wallet: "9mPz4cXvL2dJqR8nWbT6yHsK3eA7uFo1gNtY5xVhQkBw", salary: usdc(6_800) },
  { id: "e3", name: "Mateo Ruiz", role: "Protocol engineer", wallet: "5hGq8wNzT3vXcP2rLmY9bKdA6sJeU4oFt7nHxVyQ1kBa", salary: usdc(7_200) },
  { id: "e4", name: "Aiko Tanaka", role: "Designer", wallet: "7vLn3sDzP9mQcX4wTbR2yHkA8eJgU6oFt5NxVhY1qKaB", salary: usdc(5_400) },
  { id: "e5", name: "Tomás Berg", role: "Growth", wallet: "2dXk6yPzW8vNcQ3rLmT9bHsA4eJgU7oFt5nVhYxK1qBa", salary: usdc(4_900) },
  { id: "e6", name: "Lena Fischer", role: "Counsel", wallet: "6bQw9nTzL3vXcP4rKmY2dHsA8eJgU5oFt7NxVhY1kBaq", salary: usdc(3_700) },
  // The company's own admin wallet is also on its payroll: one wallet can run a company and get paid by it.
  { id: "e7", name: "Jordan Avery", role: "Founder", wallet: ADMIN_WALLET, salary: usdc(8_000) },
];

export const NOT_ACTIVATED_SEED = new Set(["e5"]);

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** A stable, base58-looking 88 character stand-in for a transaction signature. */
export function fakeSig(seed: string): string {
  const rand = seededRandom(hashString(seed));
  return Array.from({ length: 88 }, () => BASE58[Math.floor(rand() * BASE58.length)]).join("");
}

export interface Payment {
  id: string;
  date: string;
  from: string;
  amount: bigint;
  status: "pending" | "available";
  signature: string;
}

export type RunStatus = "draft" | "pending_approval" | "approved" | "executing" | "done" | "failed";

export interface RunItem {
  wallet: string;
  name: string;
  amount: bigint;
  signature: string;
}

export interface Run {
  id: string;
  label: string;
  date: string;
  status: RunStatus;
  recipients: number;
  total: bigint;
  items: RunItem[];
}

const nameOf = (wallet: string) => EMPLOYEES.find((e) => e.wallet === wallet)?.name ?? (wallet === TAX_WALLET ? "Acme tax reserve" : wallet === FEE_WALLET ? "Platform fee" : "Recipient");

function seededRun(id: string, label: string, date: string, parts: [wallet: string, amount: bigint][]): Run {
  const items = parts.map(([wallet, amount]) => ({ wallet, name: nameOf(wallet), amount, signature: fakeSig(`${id}:${wallet}`) }));
  return { id, label, date, status: "done", recipients: items.length, total: items.reduce((n, i) => n + i.amount, 0n), items };
}

const [sam, priya, mateo, aiko, , lena, founder] = EMPLOYEES;

/** Newest first. r4 is the latest and is not yet applied by employees, so it shows up as "pending" on their side. */
export const SEED_RUNS: Run[] = [
  seededRun("r4", "October payroll", "Oct 01", [[sam.wallet, usdc(10_000)], [priya.wallet, usdc(6_800)], [mateo.wallet, usdc(7_200)], [aiko.wallet, usdc(5_400)], [lena.wallet, usdc(3_700)], [founder.wallet, usdc(8_000)]]),
  seededRun("r3", "September payroll", "Sep 01", [[sam.wallet, usdc(10_000)], [priya.wallet, usdc(6_800)], [mateo.wallet, usdc(7_200)], [aiko.wallet, usdc(5_400)], [lena.wallet, usdc(3_700)], [founder.wallet, usdc(8_000)]]),
  seededRun("r2", "August payroll", "Aug 01", [[sam.wallet, usdc(9_200)], [priya.wallet, usdc(6_800)], [mateo.wallet, usdc(7_200)], [aiko.wallet, usdc(5_400)], [lena.wallet, usdc(3_700)], [founder.wallet, usdc(8_000)]]),
  seededRun("r1", "Contractor invoice #014", "Jul 18", [[sam.wallet, usdc(7_900)], [TAX_WALLET, usdc(2_000)], [FEE_WALLET, usdc(100)]]),
];

export const EMPLOYER_NAME = "Acme Labs";

export interface Account {
  activated: boolean;
  /** Lamports. Every transaction an employee sends needs a little SOL. */
  sol: bigint;
  pending: bigint;
  available: bigint;
  /** Public wrapped token (WUSDC) in the wallet after a withdraw. */
  publicWusdc: bigint;
  /** Plain USDC in the wallet after an unwrap. */
  publicUsdc: bigint;
  payments: Payment[];
}

export const emptyAccount = (): Account => ({ activated: false, sol: 0n, pending: 0n, available: 0n, publicWusdc: 0n, publicUsdc: 0n, payments: [] });

export interface VaultState {
  name: string;
  created: boolean;
  treasuryConfigured: boolean;
  paused: boolean;
  /** Decrypted treasury balance (the admin's key reads it). */
  treasury: bigint;
  employees: Employee[];
  runs: Run[];
}

export const newVault = (name = "Your company"): VaultState => ({ name, created: false, treasuryConfigured: false, paused: false, treasury: 0n, employees: [], runs: [] });

export function seedAccounts(): Record<string, Account> {
  const accounts: Record<string, Account> = {};
  const get = (wallet: string) => (accounts[wallet] ??= { ...emptyAccount(), activated: true, sol: SOL(0.5) });
  // Oldest first so payments end up newest first.
  [...SEED_RUNS].reverse().forEach((run, ri, all) => {
    const latest = ri === all.length - 1;
    for (const item of run.items) {
      const a = get(item.wallet);
      const status = latest && run.id === "r4" ? "pending" : "available";
      a.payments.unshift({ id: `${run.id}:${item.wallet}`, date: run.date, from: `${EMPLOYER_NAME} payroll`, amount: item.amount, status, signature: item.signature });
      if (status === "pending") a.pending += item.amount;
      else a.available += item.amount;
    }
  });
  for (const e of EMPLOYEES) {
    if (NOT_ACTIVATED_SEED.has(e.id)) accounts[e.wallet] = emptyAccount(); // no SOL either: shows the fee requirement
  }
  accounts[sam.wallet].publicUsdc = usdc(120.5);
  accounts[ADMIN_WALLET].sol = SOL(2);
  accounts[AUDITOR_WALLET] = { ...emptyAccount(), activated: true, sol: SOL(1) };
  accounts[NEW_COMPANY_WALLET] = { ...emptyAccount(), sol: SOL(2) };
  get(TAX_WALLET);
  get(FEE_WALLET);
  return accounts;
}

export function seedVaults(): Record<string, VaultState> {
  return {
    [ADMIN_WALLET]: { name: EMPLOYER_NAME, created: true, treasuryConfigured: true, paused: false, treasury: TREASURY_BALANCE, employees: EMPLOYEES, runs: SEED_RUNS },
  };
}

export const PIPELINE_STAGES = ["Prove", "Create context", "Verify", "Transfer", "Close"] as const;
/** The stage that actually moves funds. Transfers from one treasury must land one at a time (D3). */
export const TRANSFER_STAGE = 3;
