import type { Metadata } from "next";
import { NetworkActions, SiteHeader } from "@/components/app/site-header";
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
      <SiteHeader surface="app" actions={<NetworkActions href="/app" label="Launch App" />} />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <LiveAuditor />
      </main>
    </div>
  );
}
