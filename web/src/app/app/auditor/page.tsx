import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { LiveAuditor } from "@/components/app/auditor-live";

export const metadata: Metadata = {
  title: "Audit log · Cipherpay",
  robots: { index: false, follow: false },
};

// Standalone: this route sits outside the (app) group on purpose, so it gets no wallet gate, sidebar or navbar. The auditor needs no
// login. They give the employer wallet to look at and the auditor secret, and everything is read from devnet and decrypted in this tab.
export default function AuditPage() {
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
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-all hover:bg-muted/70 hover:border-primary/40 active:scale-[0.98]"
            >
              Launch App
              <ArrowRightIcon className="size-3.5 text-primary" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1160px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <LiveAuditor />
      </main>
    </div>
  );
}
