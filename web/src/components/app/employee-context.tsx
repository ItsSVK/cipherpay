"use client";

import { useChain } from "@/components/chain/chain-state";
import { useConfidentialBalance } from "@/components/chain/use-confidential-balance";
import { useReceivedAmounts } from "@/components/chain/use-received-amounts";
import { usePayrollData } from "@/components/data/payroll-data";
import { useWallet } from "@/components/wallet/wallet-context";
import { cipherPreview } from "@/lib/format";
import { decodeReceivedAmount } from "@/lib/received-amount";

/** Smallest SOL balance we treat as "can pay network fees" for a few transactions (0.01 SOL). */
export const MIN_SOL = 10_000_000n;

/**
 * Account status that needs no keys, so the shell can use it. Read from devnet. The "new pay waiting" dot
 * is unknown without keys, so it is off.
 */
export function useAccountStatus() {
  const chain = useChain();
  const acct = chain.wallet?.wusdc ?? null;
  return { loading: chain.loading, activated: !!acct?.confidential, awaitingApproval: !!acct?.confidential && !acct.approved, sol: chain.wallet?.sol ?? 0n, pendingBadge: false };
}

/** The connected wallet's own account (the personal side of the app). Needs the key provider to decrypt balances. */
export function useEmployee() {
  const { address } = useWallet();
  const chain = useChain();
  const status = useAccountStatus();
  const decrypted = useConfidentialBalance(chain.wallet?.wusdc ?? null);
  const data = usePayrollData();
  const received = useReceivedAmounts(data.payments, chain.wallet?.wusdc?.address ?? null);
  const wallet = address ?? "";

  const w = chain.wallet;
  const ext = w?.wusdc?.confidential && w.wusdc.token.extensions.__option === "Some"
    ? w.wusdc.token.extensions.value.find((e) => e.__kind === "ConfidentialTransferAccount")
    : undefined;
  const ct = ext && ext.__kind === "ConfidentialTransferAccount" ? ext : undefined;
  return {
    wallet,
    loading: status.loading,
    activated: status.activated,
    awaitingApproval: status.awaitingApproval,
    sol: status.sol,
    hasSol: status.sol >= MIN_SOL,
    // Zero until the keys are unlocked and the ciphertexts decrypt; pages gate display on balanceStatus.
    pending: decrypted.balance?.pending ?? 0n,
    available: decrypted.balance?.available ?? 0n,
    /** `0x` + the first hex digits of the account's REAL on-chain ciphertexts, shown while encrypted (pending: its low half). */
    availableCipherHex: cipherPreview(ct?.availableBalance as unknown as ArrayLike<number> | undefined),
    pendingCipherHex: cipherPreview(ct?.pendingBalanceLow as unknown as ArrayLike<number> | undefined),
    publicWusdc: w?.wusdc?.publicBalance ?? 0n,
    publicUsdc: w?.usdc ?? 0n,
    // The chain keeps only the combined balance, so per-payment history is what employers recorded for this wallet (signed in with one signature).
    // Each amount comes encrypted to this wallet's key and is opened locally, then checked against the on-chain payment (`received`).
    payments: data.payments.map((p) => {
      const r = received.get(p.id) ?? null;
      return { id: p.id, date: new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }), from: p.label, employer: p.employer as string | null, amount: r?.status === "ready" ? r.amount : null, status: null as "pending" | "available" | null, signature: p.signature, received: r, cipherHex: cipherPreview(decodeReceivedAmount(p.receivedAmountCt)?.lo) };
    }),
    paymentsStatus: data.status,
    paymentsSigningIn: data.signingIn,
    paymentsError: data.error,
    signInForPayments: data.signIn,
    balanceStatus: decrypted.status,
    balanceError: decrypted.error,
  };
}
