"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-context";
import { useEmployee } from "./employee-context";

/** Shown when a wallet cannot pay network fees. Every signer pays their own fees, employees included. */
export function SolNotice() {
  const emp = useEmployee();
  const { isDemo } = useWallet();
  if (emp.hasSol) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pending/25 bg-pending-soft px-3.5 py-3 text-[13.5px] text-pending" role="alert">
      <p className="min-w-0 flex-1">This wallet has {emp.sol === 0n ? "no" : "very little"} SOL. Every transaction you send pays a small network fee, so you need a little SOL first.</p>
      {isDemo ? (
        <Button size="sm" variant="outline" onClick={() => { emp.airdrop(); toast.success("1 SOL added", { description: "Devnet faucet (demo)." }); }}>
          Get devnet SOL
        </Button>
      ) : (
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-lg border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-muted">
          Open the devnet faucet
        </a>
      )}
    </div>
  );
}
