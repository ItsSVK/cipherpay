"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Address } from "@/components/crypto/fingerprint";
import { Brand } from "@/components/app/brand";
import { StatusBadge } from "@/components/app/status-badge";
import { DEMO_WALLETS } from "@/lib/mock/wallets";
import { cn } from "@/lib/utils";
import { useWallet } from "./wallet-context";

/** The front door. Nothing is shown until a wallet connects, and the wallet decides which side you see. */
export function ConnectScreen() {
  const { connect, connectingTo, status } = useWallet();
  const busy = status === "connecting";
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
            One wallet can run a company, get paid, or both. Connect yours and the app shows what applies to it.
          </p>
        </div>

        <section className="plate enter mt-8 overflow-hidden" style={{ ["--i" as string]: 1 }} aria-label="Demo wallets">
          <div className="border-b bg-muted/50 px-4 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">Demo mode: pick a wallet to act as</p>
          </div>
          <ul>
            {DEMO_WALLETS.map((w) => {
              const connecting = connectingTo === w.address;
              return (
                <li key={w.address} className="border-b last:border-b-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => connect(w.address)}
                    className={cn(
                      "row-hover flex w-full items-center gap-3 px-4 py-3.5 text-left transition-[background-color,opacity] duration-200 disabled:cursor-wait",
                      busy && !connecting && "opacity-45",
                      connecting && "bg-accent",
                    )}
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
        </section>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Demo build with sample data. Real wallets (Phantom, Solflare and others) connect here later, and what you see will come from the wallet itself.
        </p>
      </main>
    </div>
  );
}
