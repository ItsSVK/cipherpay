import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { LensDemo } from "@/components/landing/lens-demo";
import { PipelineDemo } from "@/components/landing/pipeline-demo";
import { StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISCLOSURE = [
  { step: "Wrap and fund the treasury", what: "USDC becomes WUSDC and enters the vault", public: true, note: "Public. Anyone can see the company funded its treasury." },
  { step: "Pay employees", what: "Vault to each wallet, amounts encrypted", public: false, note: "Addresses are public. Amounts are ciphertext." },
  { step: "Withdraw or unwrap", what: "Employee moves some or all back to plain USDC", public: true, note: "Public at that moment, and only for the amount they choose." },
  { step: "Audit", what: "The mint's auditor decrypts payments", public: false, note: "One auditor key per mint. Rotation is a direct token-program call." },
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:block">How it works</a>
          <a href="#disclosure" className="hidden rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:block">What stays hidden</a>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "ml-2 h-9 px-3.5")}>
            Launch app
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pt-16">
          <div className="enter" style={{ ["--i" as string]: 0 }}>
            <h1 className="text-[2.75rem] font-semibold leading-[1.02] sm:text-6xl lg:text-[4.25rem]">
              Payroll the public can&apos;t read.
            </h1>
            <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground">
              Fund a treasury, approve a payroll list, and pay everyone in one flow. Amounts are encrypted on-chain.
              Each employee sees their own pay, and your auditor sees all of it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-5 text-[15px]")}>
                Launch app <ArrowRightIcon className="size-4" />
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-muted-foreground">Demo data. Not audited. Devnet only.</p>
          </div>
          <div className="enter" style={{ ["--i" as string]: 2 }}>
            <LensDemo />
          </div>
        </section>

        <section id="how" className="border-y bg-card">
          <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Every payout is a few small, checkable steps.</h2>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                Proofs are built in your browser, so your keys never leave it. The app tracks each recipient, so an interrupted run resumes
                without paying anyone twice.
              </p>
            </div>
            <PipelineDemo />
          </div>
        </section>

        <section id="disclosure" className="mx-auto w-full max-w-[1120px] px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">Exactly what is hidden, and what is not.</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              The transfer is encrypted. Funding and cash-out are not. What you disclose when you withdraw is your own choice, so partial and
              delayed withdrawals are the default.
            </p>
          </div>
          <div className="plate mt-10 overflow-hidden">
            {DISCLOSURE.map((row) => (
              <div key={row.step} className="row-hover grid items-center gap-x-6 gap-y-1 border-b px-5 py-4 last:border-b-0 sm:grid-cols-[1.1fr_1.3fr_auto]">
                <div>
                  <p className="text-[15px] font-medium">{row.step}</p>
                  <p className="text-[13px] text-muted-foreground">{row.what}</p>
                </div>
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">{row.note}</p>
                <div className="sm:justify-self-end">
                  <StatusBadge tone={row.public ? "pending" : "verified"}>{row.public ? "Public amount" : "Encrypted"}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-card">
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
            <h2 className="max-w-md text-2xl font-semibold leading-snug sm:text-3xl">Connect a wallet and see payday from your side.</h2>
            <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "h-10 gap-2 px-4")}>
              Launch app <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="mx-auto w-full max-w-[1120px] px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        Confidential payroll on Solana devnet. Built on Token-2022 confidential transfers.
      </footer>
    </div>
  );
}
