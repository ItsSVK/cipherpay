"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon, MenuIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import type { UiWalletAccount } from "@wallet-standard/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Address } from "@/components/crypto/fingerprint";
import { KeyChip } from "@/components/crypto/key-chip";
import { SignInGate } from "@/components/data/sign-in-gate";
import { WalletKeyProvider } from "@/components/crypto/wallet-key-provider";
import { UnlockDialog } from "@/components/crypto/unlock-dialog";
import { ChainProvider, useChain } from "@/components/chain/chain-state";
import { PayrollDataProvider } from "@/components/data/payroll-data";
import { ConnectScreen } from "@/components/wallet/connect-screen";
import { useWallet } from "@/components/wallet/wallet-context";
import { COMPANY_NAME } from "@/lib/payroll/types";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { useAccountStatus } from "./employee-context";
import { useCompanyStatus } from "./vault-context";
import { navFor, sectionFromPath, type NavGroup } from "./nav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ConfirmDialog } from "./confirm-dialog";
import { OperatorProvider } from "./operator-context";
import { OperatorModal } from "./operator-modal";
import { StartChooser } from "./start-chooser";
import { ThemeToggle } from "./theme-toggle";

function NavList({ groups, pathname, onNavigate }: { groups: NavGroup[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="grid gap-4">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="grid gap-1">
          {g.label ? (
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {g.label}
            </p>
          ) : null}
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
                  "transition-all duration-200 ease-out-expo active:scale-[0.985]",
                  active
                    ? "bg-primary/10 text-primary font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-[17px] transition-transform duration-300 ease-out-expo", !active && "group-hover:translate-x-0.5", active && "text-primary")} />
                <span>{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      "ml-1.5 size-1.5 rounded-full ring-2 ring-background",
                      item.badge === "setup" ? "bg-primary [animation:dot-pulse_1.6s_ease-in-out_infinite]" : "bg-pending [animation:dot-pulse_1.6s_ease-in-out_infinite]"
                    )}
                    role="img"
                    aria-label={item.badge === "setup" ? "Setup needed" : "New pay waiting"}
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "ml-auto size-1.5 rounded-full bg-primary transition-all duration-300 ease-out-expo",
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

function SidebarBody({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-6 p-4">
      <div className="grid gap-6">
        <Brand href="/" />
        <NavList groups={groups} pathname={pathname} onNavigate={onNavigate} />
      </div>

      <div className="grid gap-2.5">
        <div className="grid gap-2 rounded-xl border border-border/80 bg-card/80 p-3.5 text-xs leading-relaxed text-muted-foreground shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="size-2 rounded-full bg-verified [animation:dot-pulse_2s_ease-in-out_infinite]" aria-hidden />
              Solana Devnet
            </div>
            <InfoTooltip content="Live connection to Solana devnet Token-2022 confidential transfer mint." />
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Balances synced live with devnet Token-2022 confidential accounts.
          </p>
        </div>
      </div>
    </div>
  );
}

const solText = (lamports: bigint) => `${(Number(lamports) / 1e9).toFixed(2)} SOL`;

function ConnectedShell({ address, account: walletAccount, children }: { address: string; account: UiWalletAccount; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const wallet = useWallet();
  const [menu, setMenu] = useState(false);
  const [disconnectModal, setDisconnectModal] = useState(false);

  const section = sectionFromPath(pathname);
  const company = useCompanyStatus();
  const account = useAccountStatus();
  const chain = useChain();
  const companyReady = company.ready;
  // A fresh wallet (no activated account, no company started) is asked where to start. Only once the chain has
  // really answered: a failed read would otherwise look like an empty wallet.
  const stateKnown = chain.status === "ready";
  const freshWallet = stateKnown && !account.loading && !company.loading && !account.activated && !company.created;

  let redirect: string | null = null;
  if (section === null) {
    redirect = "/pay";
  } else if (section === "admin" && !companyReady && !company.loading && pathname !== "/admin") {
    redirect = "/admin";
  }
  const inPlace = redirect === null;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  const groups = navFor({ companyReady, payBadge: account.loading ? undefined : !account.activated ? "setup" : account.pendingBadge ? "pay" : undefined });
  const crumb = section === "admin" && companyReady ? COMPANY_NAME : null;
  const crumbPage = section === "admin" ? (companyReady ? "Payroll vault" : "Company setup") : "My pay";
  const label = wallet.walletName;

  const handleDisconnect = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await wallet.disconnect();
    toast.success("Wallet disconnected", { description: "Session ended and keys cleared from browser memory." });
  };

  const body = (
    <OperatorProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar/80 backdrop-blur-md lg:block">
          <SidebarBody groups={groups} pathname={pathname} />
        </aside>
        <div className="min-w-0">
          <div className="sticky top-0 z-30 flex h-15 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md sm:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Sheet open={menu} onOpenChange={setMenu}>
                <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                  <MenuIcon />
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 sm:max-w-[280px]">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <SidebarBody
                    groups={groups}
                    pathname={pathname}
                    onNavigate={() => setMenu(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>
            <div className="hidden text-sm text-muted-foreground lg:block">
              {crumb ? (
                <>
                  <span className="font-medium text-foreground">{crumb}</span>
                  <span className="mx-2 text-border">/</span>
                </>
              ) : null}
              <span className="font-medium text-foreground">{crumbPage}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5">
              <KeyChip seed={address} />
              <div className="hidden h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] shadow-2xs sm:inline-flex">
                <span className="hidden font-medium text-foreground md:inline">{label ?? "Wallet"}</span>
                <Address value={address} className="font-mono text-[13px] text-muted-foreground" />
                {!account.loading ? <span className="font-mono text-[13px] tnum text-muted-foreground">{solText(account.sol)}</span> : null}
              </div>
              <ThemeToggle size="sm" />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh devnet state"
                title={chain.updatedAt ? `Live devnet data. Updated ${new Date(chain.updatedAt).toLocaleTimeString()}. Click to refresh.` : "Reading devnet…"}
                onClick={chain.refresh}
                className="rounded-full"
              >
                <RefreshCwIcon className={cn("size-4", chain.loading && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Disconnect wallet"
                title="Disconnect wallet"
                onClick={() => setDisconnectModal(true)}
                className="rounded-full text-muted-foreground hover:text-destructive"
              >
                <LogOutIcon className="size-4" />
              </Button>
            </div>
          </div>
          <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:py-10">
            {inPlace ? children : null}
          </main>
        </div>
      </div>
      <UnlockDialog />
      <OperatorModal />
      <StartChooser key={address} eligible={freshWallet} />
      <ConfirmDialog
        open={disconnectModal}
        onOpenChange={setDisconnectModal}
        title="Disconnect Wallet"
        description="Are you sure you want to disconnect? Your local derived encryption keys will be securely cleared from memory."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={handleDisconnect}
      />
    </OperatorProvider>
  );

  return <WalletKeyProvider key={address} account={walletAccount}>{body}</WalletKeyProvider>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const pathname = usePathname();
  const router = useRouter();
  // Logging out (or the wallet dropping its account) shows the connect screen, so the URL must say so too instead of staying on /admin/payroll.
  const loggedOut = wallet.status === "disconnected" && pathname !== "/app";
  useEffect(() => {
    if (loggedOut) router.replace("/app");
  }, [loggedOut, router]);
  if (wallet.status === "loading") return <div className="min-h-dvh" aria-busy="true" />;
  if (wallet.status !== "connected" || !wallet.address || !wallet.account) return <ConnectScreen />;
  return (
    <PayrollDataProvider account={wallet.account}>
      <SignInGate key={wallet.address}>
        <ChainProvider>
          <ConnectedShell address={wallet.address} account={wallet.account}>{children}</ConnectedShell>
        </ChainProvider>
      </SignInGate>
    </PayrollDataProvider>
  );
}
