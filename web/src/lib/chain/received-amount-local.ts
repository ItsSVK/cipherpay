// CLIENT-ONLY. Opens payment amounts that were encrypted to the recipient (lib/received-amount.ts) with the recipient's ElGamal secret,
// ON THE CALLING THREAD. The app calls openReceivedAmounts in lib/crypto/proof-client.ts, which runs this in the proof worker.
import { decodeReceivedAmount } from "@/lib/received-amount";

const LO_BITS = 16n;

/**
 * One amount per input, in order; null where there is nothing to open, the bytes are malformed, or the ciphertext does not decrypt to
 * a valid lo/hi pair under this key (it was encrypted to someone else, or tampered with).
 */
export async function openReceivedAmountsLocal(encoded: readonly (string | null)[], secretKey: Uint8Array): Promise<(bigint | null)[]> {
  const { ElGamalCiphertext, ElGamalSecretKey } = await import("@solana/zk-sdk/bundler");
  const secret = ElGamalSecretKey.fromBytes(secretKey);
  const open = (bytes: Uint8Array): bigint | null => {
    const ct = ElGamalCiphertext.fromBytes(bytes);
    if (!ct) return null;
    try {
      // Typed as bigint, but documented to return undefined when there is no small discrete log (wrong key or not an amount).
      return (secret.decrypt(ct) as bigint | undefined) ?? null;
    } catch {
      return null;
    } finally {
      ct.free();
    }
  };
  try {
    return encoded.map((e) => {
      const parts = decodeReceivedAmount(e);
      if (!parts) return null;
      const lo = open(parts.lo);
      const hi = open(parts.hi);
      // Token-2022 range-proves lo < 2^16 and hi < 2^32; anything else is not a real payment amount.
      if (lo === null || hi === null || lo < 0n || hi < 0n || lo >= 1n << LO_BITS || hi >= 1n << 32n) return null;
      return lo + (hi << LO_BITS);
    });
  } finally {
    secret.free();
  }
}
