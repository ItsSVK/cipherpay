import { BuildingIcon, LayoutDashboardIcon, SendIcon, SplitIcon, UsersIcon, WalletIcon, type LucideIcon } from "lucide-react";

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
  { href: "/admin/addresses", label: "Addresses", icon: UsersIcon },
  { href: "/admin/payroll", label: "Run payroll", icon: SendIcon },
  { href: "/admin/split", label: "Split payout", icon: SplitIcon },
];

/**
 * Every wallet sees My pay and Company. The four company pages only appear once the company is set
 * up; until then "Company" is a single entry that opens the setup flow.
 */
export function navFor(opts: { companyReady: boolean; payBadge: "setup" | "pay" | undefined }): NavGroup[] {
  const pay: NavItem = { href: "/pay", label: "My pay", icon: WalletIcon, badge: opts.payBadge };
  if (opts.companyReady) return [{ items: [pay] }, { label: "Company", items: COMPANY }];
  return [{ items: [pay, { href: "/admin", label: "Company", icon: BuildingIcon }] }];
}

export type Section = "admin" | "pay";

/** Which part of the app a URL belongs to, or null for neutral routes such as /app. */
export function sectionFromPath(pathname: string): Section | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/pay")) return "pay";
  return null;
}
