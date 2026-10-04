import { BuildingIcon, LayoutDashboardIcon, ScrollTextIcon, SendIcon, SplitIcon, UsersIcon, WalletIcon, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/mock/wallets";

export type { Role };

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** A dot on the item: "setup" when the account still needs activating, "pay" when new pay is waiting. */
  badge?: "setup" | "pay";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const COMPANY: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/admin/employees", label: "Employees", icon: UsersIcon },
  { href: "/admin/payroll", label: "Run payroll", icon: SendIcon },
  { href: "/admin/split", label: "Split payout", icon: SplitIcon },
];

/**
 * Members always see My pay and Company. The four company pages only appear once the company is set
 * up; until then "Company" is a single entry that opens the setup flow.
 */
export function navFor(role: Role, opts: { companyReady: boolean; payBadge: "setup" | "pay" | undefined }): NavGroup[] {
  if (role === "auditor") return [{ items: [{ href: "/auditor", label: "Audit log", icon: ScrollTextIcon }] }];
  const pay: NavItem = { href: "/pay", label: "My pay", icon: WalletIcon, badge: opts.payBadge };
  if (opts.companyReady) return [{ items: [pay] }, { label: "Company", items: COMPANY }];
  return [{ items: [pay, { href: "/admin", label: "Company", icon: BuildingIcon }] }];
}

export type Section = "admin" | "pay" | "auditor";

/** Which part of the app a URL belongs to, or null for neutral routes such as /app. */
export function sectionFromPath(pathname: string): Section | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/pay")) return "pay";
  if (pathname.startsWith("/auditor")) return "auditor";
  return null;
}
