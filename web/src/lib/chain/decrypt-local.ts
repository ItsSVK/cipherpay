// CLIENT-ONLY. Decrypts a confidential token account's balances with the user's unlocked keys, ON THE CALLING THREAD. The app calls the
// off-thread wrapper in decrypt.ts instead; this is what the proof worker runs, and the fallback when workers are unavailable.
import type { DerivedKeys } from "@/lib/crypto/keys";
import type { ConfidentialAccountView } from "./read";

export interface DecryptedBalance {
  /** Spendable: the AES "decryptable" balance. */
  available: bigint;
  /** Received but not yet applied (ElGamal). */
  pending: bigint;
  total: bigint;
}

export class WrongKeyError extends Error {
  constructor() {
    super("This account was set up with a different encryption key than the one derived from this wallet, so it can't be decrypted here.");
    this.name = "WrongKeyError";
  }
}

export async function decryptAccountBalanceLocal(view: Pick<ConfidentialAccountView, "token" | "elgamalPubkey">, keys: DerivedKeys): Promise<DecryptedBalance> {
  // A clear message beats an opaque decryption failure if the account was configured with another key.
  if (view.elgamalPubkey !== null && view.elgamalPubkey !== keys.elgamalKeypair.elgamalPubkey) throw new WrongKeyError();
  const [{ AeKey, ElGamalSecretKey }, { decryptConfidentialTransferBalance }] = await Promise.all([import("@solana/zk-sdk/bundler"), import("@solana-program/token-2022/confidential")]);
  const aesKey = AeKey.fromBytes(keys.aeKey);
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(keys.elgamalKeypair.secretKey);
  try {
    const b = decryptConfidentialTransferBalance({ tokenAccount: view.token, elgamalSecretKey, aesKey });
    return { available: b.availableBalance, pending: b.pendingBalance, total: b.totalBalance };
  } finally {
    aesKey.free();
    elgamalSecretKey.free();
  }
}
