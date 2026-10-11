"use client";

import { WalletProvider } from "@/components/wallet/wallet-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
