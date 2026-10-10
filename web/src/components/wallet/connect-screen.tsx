"use client";

import Link from "next/link";
import { ArrowLeftIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { useConnect, type UiWallet } from "@wallet-standard/react";
import { Address } from "@/components/crypto/fingerprint";
import { Brand } from "@/components/app/brand";
import { StatusBadge } from "@/components/app/status-badge";
import { DEMO_WALLETS } from "@/lib/mock/wallets";
import { cn } from "@/lib/utils";
import { useWallet } from "./wallet-context";

const GET_WALLETS = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
  { name: "Backpack", href: "https://backpack.app/downloads" },
];

/** One detected wallet. Each row needs its own component because useConnect is a per-wallet hook. */
function WalletRow({ wallet, disabled }: { wallet: UiWallet; disabled: boolean }) {
  const { selectAccount } = useWallet();
  const [isConnecting, connect] = useConnect(wallet);
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        disabled={disabled || isConnecting}
        onClick={async () => {
          try {
            const accounts = await connect();
            if (accounts[0]) selectAccount(accounts[0]);
            else toast.error("No account was shared", { description: "Approve at least one account in your wallet." });
          } catch (e) {
            // A closed or rejected prompt is normal, so keep the message calm.
            toast.error("Connection cancelled", { description: e instanceof Error ? e.message : undefined });
          }
        }}
        className={cn("row-hover flex w-full items-center gap-3 px-4 py-3.5 text-left transition-[background-color,opacity] duration-200 disabled:cursor-wait", isConnecting && "bg-accent", disabled && !isConnecting && "opacity-45")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs supplied by the wallet */}
        {wallet.icon ? <img src={wallet.icon} alt="" className="size-8 rounded-lg" /> : <span className="grid size-8 place-items-center rounded-lg bg-muted"><WalletIcon className="size-4" /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{wallet.name}</p>
          <p className="text-[13px] text-muted-foreground">{wallet.accounts.length > 0 ? "Already authorized for this site" : "Detected in this browser"}</p>
        </div>
        <span className="shrink-0 text-[13px] font-medium text-primary">{isConnecting ? "Check your wallet…" : "Connect"}</span>
      </button>
    </li>
  );
}

/** The front door. Nothing is shown until a wallet connects. */
export function ConnectScreen() {
  const { wallets, connectDemo, connectingTo, status } = useWallet();
  const demoBusy = status === "connecting";
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Brand />
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Back to site
        </Link>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <div className="enter" style={{ ["--i" as string]: 0 }}>
          <h1 className="text-[2rem] font-semibold leading-tight sm:text-4xl">Connect your wallet</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
            One wallet can run a company, get paid, or both. Connect yours and the app shows what applies to it. Switch your wallet to Solana devnet first.
          </p>
        </div>

        <section className="plate enter mt-8 overflow-hidden" style={{ ["--i" as string]: 1 }} aria-label="Wallets">
          {wallets.length > 0 ? (
            <ul>
              {wallets.map((w) => (
                <WalletRow key={w.name} wallet={w} disabled={demoBusy} />
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <p className="text-[15px] font-medium">No Solana wallet found in this browser.</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Install one, then reload this page. Wallets that support devnet appear here automatically.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {GET_WALLETS.map((g) => (
                  <a key={g.name} href={g.href} target="_blank" rel="noreferrer" className="rounded-full border bg-card px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-primary/40 hover:text-primary">
                    Get {g.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="enter mt-8" style={{ ["--i" as string]: 2 }} aria-label="Demo wallets">
          <h2 className="font-sans text-sm font-semibold tracking-normal">Or explore with sample data</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Demo wallets are not real. They use made-up balances and send no transactions.</p>
          <div className="plate mt-3 overflow-hidden">
            <ul>
              {DEMO_WALLETS.map((w) => {
                const connecting = connectingTo === w.address;
                return (
                  <li key={w.address} className="border-b last:border-b-0">
                    <button
                      type="button"
                      disabled={demoBusy}
                      onClick={() => connectDemo(w.address)}
                      className={cn("row-hover flex w-full items-center gap-3 px-4 py-3.5 text-left transition-[background-color,opacity] duration-200 disabled:cursor-wait", demoBusy && !connecting && "opacity-45", connecting && "bg-accent")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {w.label}
                          <StatusBadge tone={w.role === "auditor" ? "pending" : "key"}>{w.tag}</StatusBadge>
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">{w.blurb}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {connecting ? <span className="text-[13px] font-medium text-primary">Connecting…</span> : <Address value={w.address} className="text-muted-foreground" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <p className="enter mt-8 text-[13px] text-muted-foreground" style={{ ["--i" as string]: 3 }}>
          Auditing a company&apos;s payments? No wallet needed.{" "}
          <Link href="/app/auditor" className="font-medium text-primary underline-offset-4 hover:underline">
            Open the audit page
          </Link>
        </p>
      </main>
    </div>
  );
}
