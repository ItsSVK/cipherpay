"use client";

import { useCallback } from "react";
import { useSignMessage } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { toast } from "sonner";
import { checkKeyContinuity, deriveWalletKeys, toMessagePartialSigner } from "@/lib/crypto/keys";
import { TxSignerProvider } from "@/components/chain/tx-signer";
import { KeyProvider } from "./key-context";

/**
 * Key provider for a real connected wallet: keys come from one signMessage approval. Remount it (give it
 * a `key` of the wallet address) whenever the wallet changes so old keys are dropped.
 */
export function WalletKeyProvider({ account, children }: { account: UiWalletAccount; children: React.ReactNode }) {
  const signMessage = useSignMessage(account);
  const deriver = useCallback(async () => {
    const keys = await deriveWalletKeys(toMessagePartialSigner(account.address, (message) => signMessage({ message })));
    if (checkKeyContinuity(account.address, keys.elgamalKeypair.elgamalPubkey) === "changed") {
      toast.warning("This wallet derived different keys than last time", {
        description: "Its signatures are not repeatable, so anything encrypted under your earlier key can't be read. Don't put funds behind this wallet's confidential account.",
        duration: 15000,
      });
    }
    return keys;
  }, [account.address, signMessage]);
  return (
    <KeyProvider mode="signature" deriver={deriver}>
      <TxSignerProvider account={account}>{children}</TxSignerProvider>
    </KeyProvider>
  );
}
