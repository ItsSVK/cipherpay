"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon, MenuIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Address } from "@/components/crypto/fingerprint";
import { KeyChip } from "@/components/crypto/key-chip";
import { KeyProvider } from "@/components/crypto/key-context";
import { UnlockDialog } from "@/components/crypto/unlock-dialog";
import { ConnectScreen } from "@/components/wallet/connect-screen";
import { useWallet } from "@/components/wallet/wallet-context";
import { useDemoStore } from "@/lib/mock/store";
import { ROLE_META, roleOf, walletLabel } from "@/lib/mock/wallets";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { NAV, roleFromPath, type Role } from "./nav";
import { StatusBadge } from "./status-badge";

function NavList({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="grid gap-0.5">
      {NAV[role].map((item) => {
        const active = item.href === pathname || (item.href !== ROLE_META[role].home && pathname.startsWith(item.href));
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
    </nav>
  );
}

function SidebarBody({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <Brand href="/" />
      <div className="rounded-lg bg-muted px-3 py-2.5">
        <p className="text-[13px] font-medium">{ROLE_META[role].label} view</p>
        <p className="text-xs text-muted-foreground">{ROLE_META[role].blurb}</p>
      </div>
      <NavList role={role} pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto grid gap-2 rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span className="size-1.5 rounded-full bg-verified [animation:dot-pulse_2s_ease-in-out_infinite]" aria-hidden />
          Solana devnet
        </div>
        Demo data. Proofs and chain calls are not connected yet.
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

  const role = roleOf(address);
  const home = ROLE_META[role].home;
  const inPlace = roleFromPath(pathname) === role;

  // Your wallet decides your side of the app: neutral routes and other roles' routes send you home.
  useEffect(() => {
    if (!inPlace) router.replace(home);
  }, [inPlace, home, router]);

  const vaultName = store.vaultOf(address).name;
  const crumb = role === "admin" ? vaultName : null;
  const label = walletLabel(address);

  return (
    // Remounting on address change drops every derived key, as the key-handling rules require.
    <KeyProvider key={address} mode={role === "auditor" ? "import" : "signature"}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar lg:block">
          <SidebarBody role={role} pathname={pathname} />
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
                  <SidebarBody role={role} pathname={pathname} onNavigate={() => setMenu(false)} />
                </SheetContent>
              </Sheet>
            </div>
            <div className="hidden text-sm text-muted-foreground lg:block">
              {crumb ? (
                <>
                  {crumb} <span className="mx-1.5 text-border">/</span>
                </>
              ) : null}
              <span className="text-foreground">{role === "admin" ? "Payroll vault" : role === "employee" ? "My account" : "Compliance"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <KeyChip seed={address} />
              <span className="hidden items-center gap-2.5 rounded-full border bg-card py-1 pl-3 pr-1.5 sm:inline-flex">
                <span className="hidden text-[13px] font-medium md:inline">{label ?? "Wallet"}</span>
                <Address value={address} className="text-muted-foreground" />
                <span className="font-mono text-[11.5px] tnum text-muted-foreground">{solText(store.accountOf(address).sol)}</span>
                <StatusBadge tone="neutral">{ROLE_META[role].label}</StatusBadge>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Disconnect wallet"
                title="Disconnect wallet"
                onClick={() => {
                  wallet.disconnect();
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
    </KeyProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  if (wallet.status === "loading") return <div className="min-h-dvh" aria-busy="true" />;
  if (wallet.status !== "connected" || !wallet.address) return <ConnectScreen />;
  return <ConnectedShell address={wallet.address}>{children}</ConnectedShell>;
}
