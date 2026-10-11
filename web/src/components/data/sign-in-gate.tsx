"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app/brand";
import { useWallet } from "@/components/wallet/wallet-context";
import { usePayrollData } from "./payroll-data";

/**
 * Sits between "wallet connected" and the dashboard. A real wallet has to sign the sign-in message before anything opens, because the
 * addresses, payroll and split pages all need the session that signature starts. The prompt appears by itself once, right after
 * connecting; if it is declined the screen stays with a Try again button and a way to pick another wallet.
 *
 * It only blocks until the wallet has been signed in ONCE. After that it lets everything through for good, so a session that expires in
 * the middle of a payroll run is handled by the page's own sign-in prompt and never unmounts a run in progress.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const d = usePayrollData();
  const wallet = useWallet();
  const [passed, setPassed] = useState(false);
  const prompted = useRef(false);
  const open = d.status === "ready";

  useEffect(() => {
    // Latch the first time the wallet is signed in (an effect, not render, so the gate never flips back).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setPassed(true);
  }, [open]);

  useEffect(() => {
    if (d.status === "needs-auth" && !d.signingIn && !prompted.current) {
      prompted.current = true;
      void d.signIn();
    }
  }, [d]);

  if (open || passed) return <>{children}</>;

  const leave = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await wallet.disconnect();
    toast.success("Wallet disconnected");
  };

  const waiting = d.status === "loading" || d.signingIn;
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

      <main className="relative mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-10 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -z-10 size-64 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
        />

        <section className="plate enter p-8 text-center" aria-live="polite">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/20 bg-accent text-primary shadow-2xs">
            <ShieldCheckIcon className="size-6" />
          </span>
          {d.status === "error" ? (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Couldn&apos;t reach your account</h1>
              <p role="alert" className="mt-2 text-sm text-destructive">{d.error}</p>
              <Button variant="outline" className="mt-6 h-10 px-5 rounded-xl font-medium" onClick={() => void d.refresh()}>Try again</Button>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Sign in with your wallet</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Approve one message in your wallet to open your dashboard. It&apos;s free, it isn&apos;t a transaction, it can&apos;t move funds and it doesn&apos;t touch your encryption keys.
              </p>
              {d.error ? (
                <p role="alert" className="mx-auto mt-4 max-w-sm rounded-lg border border-destructive/30 bg-failed-soft px-3.5 py-2 text-[13px] text-destructive">
                  {d.error}
                </p>
              ) : null}
              <Button
                className="mt-6 h-10 w-full rounded-xl text-sm font-semibold shadow-2xs"
                disabled={waiting}
                onClick={() => void d.signIn()}
              >
                {waiting ? (
                  <>
                    <RefreshCwIcon className="mr-2 size-4 animate-spin" />
                    Waiting for your wallet…
                  </>
                ) : d.error ? (
                  "Try again"
                ) : (
                  "Sign message"
                )}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => void leave()}
            className="mt-4 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Use a different wallet
          </button>
        </section>
      </main>
    </div>
  );
}
