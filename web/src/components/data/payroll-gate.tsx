"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { PageLoading } from "@/components/app/page-loading";
import { usePayrollData } from "./payroll-data";

/** Wraps pages that need the payroll list: shows sign-in or loading until the data is there. Demo wallets pass straight through. */
export function PayrollGate({ title, children }: { title: string; children: React.ReactNode }) {
  const d = usePayrollData();
  if (d.status === "demo" || d.status === "ready") return <>{children}</>;
  if (d.status === "loading") return <PageLoading label="Loading your payroll list…" />;
  return (
    <>
      <PageHeader title={title} />
      <section className="plate enter mx-auto max-w-xl p-8 text-center">
        {d.status === "needs-auth" ? (
          <>
            <p className="text-[15px] font-medium">Sign in to open your payroll list.</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Your saved addresses and run history are saved on our server, tied to your wallet. One free signature proves it&apos;s yours. It doesn&apos;t move funds or touch your encryption keys.
            </p>
            {d.error ? <p role="alert" className="mx-auto mt-3 max-w-md rounded-lg border border-destructive/30 bg-failed-soft px-3 py-2 text-[13px] text-destructive">{d.error}</p> : null}
            <Button className="mt-5 h-10 px-5" disabled={d.signingIn} onClick={() => void d.signIn()}>
              {d.signingIn ? "Waiting for your wallet…" : "Sign in with wallet"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium">Couldn&apos;t load your payroll list.</p>
            <p role="alert" className="mt-1 text-sm text-destructive">{d.error}</p>
            <Button variant="outline" className="mt-5 h-10 px-5" onClick={() => void d.refresh()}>Try again</Button>
          </>
        )}
      </section>
    </>
  );
}
