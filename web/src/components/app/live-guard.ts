"use client";

import { toast } from "sonner";
import { useWallet } from "@/components/wallet/wallet-context";

/**
 * Real wallets can read devnet state today, but sending transactions is not wired yet. Call the returned
 * function before starting any action: it lets demo wallets through and tells real wallets plainly.
 */
export function useLiveGuard() {
  const { isDemo } = useWallet();
  return () => {
    if (isDemo) return true;
    toast.info("Sending transactions isn't wired up yet", { description: "Your real devnet state is shown. This action works with demo wallets for now." });
    return false;
  };
}
