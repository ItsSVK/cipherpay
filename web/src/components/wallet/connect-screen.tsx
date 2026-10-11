"use client";

import Link from "next/link";
import { ArrowRightIcon, ExternalLinkIcon, InfoIcon, RefreshCwIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { useConnect, type UiWallet } from "@wallet-standard/react";
import { Brand } from "@/components/app/brand";
import { cn } from "@/lib/utils";
import { useWallet } from "./wallet-context";

const GET_WALLETS = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
  { name: "Backpack", href: "https://backpack.app/downloads" },
];

/** One detected wallet. Each row needs its own component because useConnect is a per-wallet hook. */
function WalletRow({ wallet }: { wallet: UiWallet }) {
  const { selectAccount } = useWallet();
  const [isConnecting, connect] = useConnect(wallet);

  const handleConnect = async () => {
    try {
      const accounts = await connect();
      if (accounts[0]) selectAccount(accounts[0]);
      else toast.error("No account was shared", { description: "Approve at least one account in your wallet." });
    } catch (e) {
      // A closed or rejected prompt is normal, so keep the message calm.
      toast.error("Connection cancelled", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const isAuthorized = wallet.accounts.length > 0;

  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        disabled={isConnecting}
        onClick={handleConnect}
        className={cn(
          "group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-all duration-200 ease-out sm:px-6",
          "hover:bg-muted/40 active:scale-[0.995]",
          "disabled:cursor-wait",
          isConnecting && "bg-accent/40"
        )}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          {wallet.icon ? (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/80 bg-card p-1.5 shadow-2xs transition-transform duration-200 group-hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs supplied by the wallet */}
              <img src={wallet.icon} alt={wallet.name} className="size-full rounded-lg object-contain" />
            </div>
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/80 bg-muted text-muted-foreground shadow-2xs transition-transform duration-200 group-hover:scale-105">
              <WalletIcon className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight text-foreground">{wallet.name}</p>
              {isAuthorized && (
                <span className="inline-flex items-center gap-1 rounded-full border border-verified/30 bg-verified-soft px-2 py-0.5 text-[10px] font-medium text-verified">
                  <span className="size-1 rounded-full bg-verified" />
                  Authorized
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {isAuthorized ? "Already authorized for this site" : "Detected in this browser"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          <span
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold shadow-2xs transition-all duration-200",
              isConnecting
                ? "border-primary/30 bg-accent text-accent-foreground"
                : "border-transparent bg-primary text-primary-foreground group-hover:bg-primary/90"
            )}
          >
            {isConnecting ? (
              <>
                <RefreshCwIcon className="size-3.5 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                Connect
                <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </span>
        </div>
      </button>
    </li>
  );
}

/** The front door. Nothing is shown until a wallet connects. */
export function ConnectScreen() {
  const { wallets } = useWallet();
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between px-4 sm:px-6">
          <Brand href="/" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 shadow-2xs text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-verified [animation:dot-pulse_2s_ease-in-out_infinite]" />
              <span>Solana Devnet</span>
            </div>
            <Link
              href="/app/auditor"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-all hover:bg-muted/70 hover:border-primary/40 active:scale-[0.98]"
            >
              Audit log
              <ArrowRightIcon className="size-3.5 text-primary" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-xl flex-1 px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -z-10 size-64 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
        />

        <div className="enter" style={{ ["--i" as string]: 0 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-foreground shadow-2xs mb-4">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            <span>Confidential Payroll</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Connect your wallet
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            One wallet can run a company, receive private compensation, or both. Connect yours to verify authorization and access your ledger.
          </p>
        </div>

        <section className="plate enter mt-8 overflow-hidden" style={{ ["--i" as string]: 1 }} aria-label="Available Wallets">
          <div className="flex items-center justify-between border-b border-border/60 p-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                <WalletIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Available Wallets</h2>
                <p className="text-[11px] text-muted-foreground">Select a wallet to authenticate your session</p>
              </div>
            </div>
            {wallets.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-verified/30 bg-verified-soft px-2.5 py-0.5 text-[11px] font-medium text-verified">
                <span className="size-1.5 rounded-full bg-verified" />
                {wallets.length} detected
              </span>
            )}
          </div>

          {wallets.length > 0 ? (
            <ul>
              {wallets.map((w) => (
                <WalletRow key={w.name} wallet={w} />
              ))}
            </ul>
          ) : (
            <div className="p-6 sm:p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <WalletIcon className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">No Solana wallet detected</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
                Install a Solana wallet extension to continue. Once installed, reload this page to connect to Cipherpay.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {GET_WALLETS.map((g) => (
                  <a
                    key={g.name}
                    href={g.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-muted/50 active:scale-[0.98]"
                  >
                    Get {g.name}
                    <ExternalLinkIcon className="size-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
            <InfoIcon className="size-3.5 shrink-0 text-primary" />
            <span>Ensure your wallet is connected to <strong className="font-medium text-foreground">Solana Devnet</strong>.</span>
          </div>
        </section>

        {wallets.length > 0 && (
          <div className="enter mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground" style={{ ["--i" as string]: 1 }}>
            <span>Need another wallet?</span>
            <div className="flex items-center gap-2">
              {GET_WALLETS.map((g, i) => (
                <span key={g.name} className="flex items-center gap-2">
                  {i > 0 && <span className="text-border">·</span>}
                  <a
                    href={g.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline underline-offset-4"
                  >
                    {g.name}
                  </a>
                </span>
              ))}
            </div>
          </div>
        )}

        <section className="plate enter mt-6 p-5 sm:p-6" style={{ ["--i" as string]: 2 }} aria-label="Auditor access">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground border border-primary/20 shadow-2xs">
                <ShieldCheckIcon className="size-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  Auditing a company&apos;s payments?
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed max-w-sm">
                  Zero-knowledge audit access requires no wallet connection. Decrypt on-chain payments using the mint auditor secret.
                </p>
              </div>
            </div>
            <Link
              href="/app/auditor"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-2xs transition-all hover:bg-muted/70 hover:border-primary/40 active:scale-[0.98]"
            >
              Open audit log
              <ArrowRightIcon className="size-3.5 text-primary" />
            </Link>
          </div>
        </section>

        <div className="enter mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ ["--i" as string]: 3 }}>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 text-center shadow-2xs backdrop-blur-xs">
            <p className="text-xs font-semibold text-foreground">Token-2022</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Confidential transfers</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 text-center shadow-2xs backdrop-blur-xs">
            <p className="text-xs font-semibold text-foreground">Client-Side ZK</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Keys stay in browser</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 text-center shadow-2xs backdrop-blur-xs">
            <p className="text-xs font-semibold text-foreground">Auditable</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Dual-key encryption</p>
          </div>
        </div>
      </main>
    </div>
  );
}
