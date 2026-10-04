import { LayoutDashboardIcon, ScrollTextIcon, SendIcon, SplitIcon, UsersIcon, WalletIcon, ArrowDownToLineIcon, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/mock/wallets";

export type { Role };

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
    { href: "/admin/employees", label: "Employees", icon: UsersIcon },
    { href: "/admin/payroll", label: "Run payroll", icon: SendIcon },
    { href: "/admin/split", label: "Split payout", icon: SplitIcon },
  ],
  employee: [
    { href: "/employee", label: "My pay", icon: WalletIcon },
    { href: "/employee/withdraw", label: "Withdraw", icon: ArrowDownToLineIcon },
  ],
  auditor: [{ href: "/auditor", label: "Audit log", icon: ScrollTextIcon }],
};

/** Which section of the app a URL belongs to, or null for neutral routes such as /app. */
export function roleFromPath(pathname: string): Role | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/employee")) return "employee";
  if (pathname.startsWith("/auditor")) return "auditor";
  return null;
}
