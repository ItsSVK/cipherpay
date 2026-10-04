// MOCK wallets for the demo connect screen. A real wallet (wallet-standard) replaces this list later;
// what the wallet can do then comes from on-chain/off-chain lookups instead of this table.
import { ADMIN_WALLET, AUDITOR_WALLET, EMPLOYEES, NEW_COMPANY_WALLET } from "./data";

/**
 * "member" is everyone except the auditor: the same wallet can run a company (it owns a vault) and
 * get paid (it is on someone's payroll list), so there is no admin/employee split any more.
 */
export type Role = "member" | "auditor";

export interface DemoWallet {
  address: string;
  label: string;
  role: Role;
  /** Short description of what this wallet does, shown as a tag. */
  tag: string;
  blurb: string;
}

const sam = EMPLOYEES[0];
const tomas = EMPLOYEES[4];

export const DEMO_WALLETS: DemoWallet[] = [
  { address: ADMIN_WALLET, label: "Acme Labs treasury", role: "member", tag: "Company + paid", blurb: "Runs a funded company and is also on its payroll." },
  { address: NEW_COMPANY_WALLET, label: "New wallet", role: "member", tag: "Nothing yet", blurb: "No company and no pay yet. Starts on My pay." },
  { address: sam.wallet, label: sam.name, role: "member", tag: "Paid", blurb: "On Acme's payroll. Activated, with pay waiting." },
  { address: tomas.wallet, label: tomas.name, role: "member", tag: "Paid", blurb: "On Acme's payroll. Not activated, and has no SOL yet." },
  { address: AUDITOR_WALLET, label: "Acme accountant", role: "auditor", tag: "Auditor", blurb: "Decrypts payment amounts with the auditor key." },
];

export function walletLabel(address: string): string | undefined {
  return DEMO_WALLETS.find((w) => w.address === address)?.label;
}

/** The auditor holds the auditor key (it cannot be inferred from a wallet). Everyone else is a member. */
export function roleOf(address: string): Role {
  return DEMO_WALLETS.find((w) => w.address === address)?.role ?? "member";
}
