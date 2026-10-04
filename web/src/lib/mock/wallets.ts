// MOCK wallets for the demo connect screen. A real wallet (wallet-standard) replaces this list later;
// the role then comes from on-chain/off-chain lookups instead of this table.
import { ADMIN_WALLET, AUDITOR_WALLET, EMPLOYEES, NEW_COMPANY_WALLET } from "./data";

export type Role = "admin" | "employee" | "auditor";

export interface DemoWallet {
  address: string;
  label: string;
  role: Role;
  blurb: string;
}

const sam = EMPLOYEES[0];
const tomas = EMPLOYEES[4];

export const DEMO_WALLETS: DemoWallet[] = [
  { address: ADMIN_WALLET, label: "Acme Labs treasury", role: "admin", blurb: "A company with a funded vault and six people on payroll." },
  { address: NEW_COMPANY_WALLET, label: "New company", role: "admin", blurb: "No vault yet. Walk through setup from scratch." },
  { address: sam.wallet, label: sam.name, role: "employee", blurb: "Activated, has pay waiting, can withdraw." },
  { address: tomas.wallet, label: tomas.name, role: "employee", blurb: "Not activated and has no SOL yet." },
  { address: AUDITOR_WALLET, label: "Acme accountant", role: "auditor", blurb: "Decrypts payment amounts with the auditor key." },
];

export function walletLabel(address: string): string | undefined {
  return DEMO_WALLETS.find((w) => w.address === address)?.label;
}

/**
 * Decides which side of the product a connected wallet sees. The product rule: a wallet that owns a
 * vault is an admin, a wallet on someone's payroll list is an employee, and the auditor is whoever
 * holds the auditor key. A wallet we know nothing about starts a new vault.
 */
export function roleOf(address: string): Role {
  return DEMO_WALLETS.find((w) => w.address === address)?.role ?? "admin";
}

export const ROLE_META: Record<Role, { label: string; home: string; blurb: string }> = {
  admin: { label: "Admin", home: "/admin", blurb: "Run payroll" },
  employee: { label: "Employee", home: "/employee", blurb: "Get paid" },
  auditor: { label: "Auditor", home: "/auditor", blurb: "Verify" },
};
