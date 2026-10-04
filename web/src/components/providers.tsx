"use client";

import { WalletProvider } from "@/components/wallet/wallet-context";
import { DemoStoreProvider } from "@/lib/mock/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </WalletProvider>
  );
}
