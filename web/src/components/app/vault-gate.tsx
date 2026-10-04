"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { useVault } from "./vault-context";

/** Pages that spend from the treasury need a configured vault first. */
export function VaultGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { ready } = useVault();
  if (ready) return <>{children}</>;
  return (
    <>
      <PageHeader title={title} />
      <section className="plate enter mx-auto max-w-xl p-8 text-center">
        <p className="text-[15px] font-medium">Set up your vault first.</p>
        <p className="mt-1 text-sm text-muted-foreground">Payroll pays out of an encrypted treasury, which is created during vault setup.</p>
        <Link href="/admin" className={cn(buttonVariants(), "mt-5 h-10 px-5")}>Go to setup</Link>
      </section>
    </>
  );
}
