"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon, MenuIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Address } from "@/components/crypto/fingerprint";
import { KeyChip } from "@/components/crypto/key-chip";
import { KeyProvider } from "@/components/crypto/key-context";
import { WalletKeyProvider } from "@/components/crypto/wallet-key-provider";
import { UnlockDialog } from "@/components/crypto/unlock-dialog";
import { ChainProvider, useChain } from "@/components/chain/chain-state";
import { PayrollDataProvider } from "@/components/data/payroll-data";
import { ConnectScreen } from "@/components/wallet/connect-screen";
import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";
import { roleOf } from "@/lib/mock/wallets";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { useAccountStatus } from "./employee-context";
import { useCompanyStatus } from "./vault-context";
import { navFor, sectionFromPath, type NavGroup, type Role } from "./nav";
import { StatusBadge } from "./status-badge";

function NavList({ groups, pathname, onNavigate }: { groups: NavGroup[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="grid gap-4">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="grid gap-0.5">
          {g.label ? <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{g.label}</p> : null}
          {g.items.map((item) => {
            const active = item.href === pathname || (item.href !== "/admin" && item.href !== "/pay" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium",
                  "transition-[background-color,color,transform] duration-200 ease-out-expo active:scale-[0.985]",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-[17px] transition-transform duration-300 ease-out-expo", !active && "group-hover:translate-x-0.5")} />
                {item.label}
                {item.badge ? (
                  <span className={cn("ml-1 size-1.5 rounded-full", item.badge === "setup" ? "bg-primary [animation:dot-pulse_1.6s_ease-in-out_infinite]" : "bg-pending")} role="img" aria-label={item.badge === "setup" ? "Setup needed" : "New pay waiting"} title={item.badge === "setup" ? "Set up your account to receive pay" : "New pay waiting"} />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "ml-auto size-1.5 rounded-full bg-primary transition-[opacity,transform] duration-300 ease-out-expo",
                    active ? "scale-100 opacity-100" : "scale-0 opacity-0",
                  )}
                />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ groups, pathname, isDemo, onNavigate }: { groups: NavGroup[]; pathname: string; isDemo: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand href="/" />
      <NavList groups={groups} pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto grid gap-2 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span className="size-1.5 rounded-full bg-verified [animation:dot-pulse_2s_ease-in-out_infinite]" aria-hidden />
          Solana devnet
        </div>
        {isDemo ? "Demo data. Proofs and chain calls are not connected yet." : "Balances and account state are read live from devnet. Activation, company setup, funding and payroll send real transactions; the rest is not wired yet."}
      </div>
    </div>
  );
}

const solText = (lamports: bigint) => `${(Number(lamports) / 1e9).toFixed(2)} SOL`;

function ConnectedShell({ address, children }: { address: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wallet = useWallet();
  const store = useDemoStore();
  const [menu, setMenu] = useState(false);

  const role: Role = roleOf(address);
  const section = sectionFromPath(pathname);
  const company = useCompanyStatus();
  const account = useAccountStatus();
  const chain = useChain();
  const companyReady = company.ready;

  // One wallet, one portal. Members start on My pay. The company pages (everything under /admin except
  // the setup screen at /admin itself) are closed until the company is set up, URL or not.
  let redirect: string | null = null;
  if (role === "auditor") {
    if (section !== "auditor") redirect = "/auditor";
  } else if (section === "auditor" || section === null) {
    redirect = "/pay";
  } else if (section === "admin" && !companyReady && !company.loading && pathname !== "/admin") {
    redirect = "/admin";
  }
  const inPlace = redirect === null;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  const groups = navFor(role, { companyReady, payBadge: account.loading ? undefined : !account.activated ? "setup" : account.pendingBadge ? "pay" : undefined });
  const crumb = section === "admin" && companyReady ? store.vaultOf(address).name : null;
  const crumbPage = section === "admin" ? (companyReady ? "Payroll vault" : "Company setup") : section === "pay" ? "My pay" : "Compliance";
  const label = wallet.walletName;

  const body = (
    <>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar lg:block">
          <SidebarBody groups={groups} pathname={pathname} isDemo={wallet.isDemo} />
        </aside>
        <div className="min-w-0">
          <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur-sm sm:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Sheet open={menu} onOpenChange={setMenu}>
                <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                  <MenuIcon />
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 sm:max-w-[280px]">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <SidebarBody groups={groups} pathname={pathname} isDemo={wallet.isDemo} onNavigate={() => setMenu(false)} />
                </SheetContent>
              </Sheet>
            </div>
            <div className="hidden text-sm text-muted-foreground lg:block">
              {crumb ? (
                <>
                  {crumb} <span className="mx-1.5 text-border">/</span>
                </>
              ) : null}
              <span className="text-foreground">{crumbPage}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <KeyChip seed={address} />
              <span className="hidden items-center gap-2.5 rounded-full border bg-card py-1 pl-3 pr-1.5 sm:inline-flex">
                <span className="hidden text-[13px] font-medium md:inline">{label ?? "Wallet"}</span>
                <Address value={address} className="text-muted-foreground" />
                {!account.loading ? <span className="font-mono text-[11.5px] tnum text-muted-foreground">{solText(account.sol)}</span> : null}
                {wallet.isDemo ? <StatusBadge tone="pending">Demo</StatusBadge> : null}{role === "auditor" ? <StatusBadge tone="neutral">Auditor</StatusBadge> : null}
              </span>
              {!wallet.isDemo ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh devnet state"
                  title={chain.updatedAt ? `Live devnet data. Updated ${new Date(chain.updatedAt).toLocaleTimeString()}. Click to refresh.` : "Reading devnet…"}
                  onClick={chain.refresh}
                >
                  <RefreshCwIcon className={cn(chain.loading && "animate-spin")} />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Disconnect wallet"
                title="Disconnect wallet"
                onClick={async () => {
                  // End the server session too, so the next person on this browser can't read the payroll list.
                  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                  await wallet.disconnect();
                  toast("Wallet disconnected", { description: "Keys were cleared from memory." });
                }}
              >
                <LogOutIcon />
              </Button>
            </div>
          </div>
          <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:py-10">{inPlace ? children : null}</main>
        </div>
      </div>
      <UnlockDialog seed={address} />
    </>
  );

  // Remounting on address change drops every derived key, as the key-handling rules require.
  return wallet.account ? (
    <WalletKeyProvider key={address} account={wallet.account}>{body}</WalletKeyProvider>
  ) : (
    <KeyProvider key={address} mode={role === "auditor" ? "import" : "signature"}>{body}</KeyProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  if (wallet.status === "loading") return <div className="min-h-dvh" aria-busy="true" />;
  if (wallet.status !== "connected" || !wallet.address) return <ConnectScreen />;
  return (
    <PayrollDataProvider>
      <ChainProvider>
        <ConnectedShell address={wallet.address}>{children}</ConnectedShell>
      </ChainProvider>
    </PayrollDataProvider>
  );
}
