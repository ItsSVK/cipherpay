"use client";

import { createContext, useContext, useMemo } from "react";
import { useWalletAccountTransactionSigner } from "@solana/react";
import type { TransactionSigner } from "@solana/kit";
import type { UiWalletAccount } from "@wallet-standard/react";
import { SOLANA_CHAIN } from "@/lib/chain/constants";
import type { WalletSignMessage } from "@/lib/crypto/keys";

interface TxSigner {
  /** Signs transactions through the connected wallet, or null (no wallet, or a wallet that can't sign on devnet). */
  signer: TransactionSigner | null;
  /** Signs a plain message through the connected wallet. Used for the operator authorization, which must not be a transaction. */
  signMessage: WalletSignMessage | null;
  /** Why there is no signer. */
  reason: string | null;
}

const Ctx = createContext<TxSigner>({ signer: null, signMessage: null, reason: "Connect a wallet to send transactions." });

function WithSigner({ account, signMessage, children }: { account: UiWalletAccount; signMessage: WalletSignMessage; children: React.ReactNode }) {
  const signer = useWalletAccountTransactionSigner(account, SOLANA_CHAIN);
  const value = useMemo<TxSigner>(() => ({ signer, signMessage, reason: null }), [signer, signMessage]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Offers a transaction signer for a real wallet account. The hook throws for unsupported wallets, so check support first. */
export function TxSignerProvider({ account, signMessage, children }: { account: UiWalletAccount; signMessage: WalletSignMessage; children: React.ReactNode }) {
  const supported = account.features.includes("solana:signTransaction") && account.chains.includes(SOLANA_CHAIN);
  const fallback = useMemo<TxSigner>(() => ({ signer: null, signMessage: null, reason: "This wallet can't sign devnet transactions. Try a different wallet." }), []);
  return supported ? <WithSigner account={account} signMessage={signMessage}>{children}</WithSigner> : <Ctx.Provider value={fallback}>{children}</Ctx.Provider>;
}

export function useTxSigner(): TxSigner {
  return useContext(Ctx);
}
