"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheckIcon } from "lucide-react";
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
 * the middle of a payroll run is handled by the page's own sign-in prompt and never unmounts a run in progress. Demo wallets pass through.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const d = usePayrollData();
  const wallet = useWallet();
  const [passed, setPassed] = useState(false);
  const prompted = useRef(false);
  const open = d.status === "demo" || d.status === "ready";

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
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center px-4 sm:px-6">
        <Brand />
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-8 sm:pt-16">
        <section className="plate enter p-8 text-center" aria-live="polite">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-accent text-primary">
            <ShieldCheckIcon className="size-5" />
          </span>
          {d.status === "error" ? (
            <>
              <h1 className="mt-4 text-xl font-semibold">Couldn&apos;t reach your account</h1>
              <p role="alert" className="mt-2 text-sm text-destructive">{d.error}</p>
              <Button variant="outline" className="mt-6 h-10 px-5" onClick={() => void d.refresh()}>Try again</Button>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-xl font-semibold">Sign in with your wallet</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Approve one message in your wallet to open your dashboard. It&apos;s free, it isn&apos;t a transaction, it can&apos;t move funds and it doesn&apos;t touch your encryption keys.
              </p>
              {d.error ? <p role="alert" className="mx-auto mt-4 max-w-sm rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{d.error}</p> : null}
              <Button className="mt-6 h-10 w-full" disabled={waiting} onClick={() => void d.signIn()}>
                {waiting ? "Waiting for your wallet…" : d.error ? "Try again" : "Sign message"}
              </Button>
            </>
          )}
          <button type="button" onClick={() => void leave()} className="mt-4 text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            Use a different wallet
          </button>
        </section>
      </main>
    </div>
  );
}
