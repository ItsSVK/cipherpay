// CLIENT-ONLY. Composes the two proofs a confidential Withdraw needs (ciphertext-commitment equality and a 64-bit range proof),
// ported from client/src/lib/confidentialTransferProofs.ts (`withdrawProofData`, proven on surfpool and devnet) and from
// spl-token-confidential-transfer-proof-generation's withdraw.rs. Same raw-point approach as transfer-proofs.ts: @solana/zk-sdk has no
// homomorphic subtraction, so it is done on the 64-byte encoding (32-byte commitment || 32-byte handle) with @noble/curves' Ristretto255.
import { ristretto255 } from "@noble/curves/ed25519.js";

const REMAINING_BALANCE_BITS = 64;

export interface WithdrawProofInput {
  /** The account's current available-balance ElGamal ciphertext, 64 bytes, as stored on-chain. */
  currentAvailableCiphertext: Uint8Array;
  /** That same balance in plaintext (decrypted with the AES key). Must equal what the ciphertext encrypts. */
  currentBalance: bigint;
  amount: bigint;
  /** The account owner's ElGamal secret key (32 bytes). */
  secretKey: Uint8Array;
}

export interface WithdrawProofs {
  equality: Uint8Array;
  range: Uint8Array;
  /** What remains available afterwards, in plaintext: the caller AES-encrypts it as the new decryptable balance. */
  newBalance: bigint;
}

type Point = ReturnType<typeof ristretto255.Point.fromBytes>;
const points = (b: Uint8Array): { commitment: Point; handle: Point } => ({ commitment: ristretto255.Point.fromBytes(b.subarray(0, 32)), handle: ristretto255.Point.fromBytes(b.subarray(32, 64)) });

export async function composeWithdrawProofs(input: WithdrawProofInput): Promise<WithdrawProofs> {
  const { amount, currentBalance } = input;
  if (amount <= 0n) throw new Error("The amount must be greater than zero.");
  if (amount >= 1n << 64n) throw new Error("The amount is too large.");
  if (amount > currentBalance) throw new Error("The amount is more than your available balance.");

  const { BatchedRangeProofU64Data, CiphertextCommitmentEqualityProofData, ElGamalCiphertext, ElGamalKeypair, ElGamalSecretKey, PedersenCommitment, PedersenOpening } = await import("@solana/zk-sdk/bundler");

  // Everything we allocate in WASM memory is freed at the end, whether or not a proof fails.
  const owned: { free(): void }[] = [];
  const own = <T extends { free(): void }>(x: T): T => (owned.push(x), x);
  try {
    const secret = own(ElGamalSecretKey.fromBytes(input.secretKey));
    const keypair = own(ElGamalKeypair.fromSecretKey(secret));

    const newBalance = currentBalance - amount;
    const opening = own(new PedersenOpening());
    const commitment = own(PedersenCommitment.from(newBalance, opening));

    // Token-2022 computes `current - encode(amount)`, where encode(amount) is a commitment to `amount` with a zero opening and an identity handle.
    const encoded = own(PedersenCommitment.from(amount, own(PedersenOpening.zero())));
    const current = points(input.currentAvailableCiphertext);
    const remaining = new Uint8Array(64);
    remaining.set(current.commitment.subtract(ristretto255.Point.fromBytes(encoded.toBytes())).toBytes(), 0);
    remaining.set(current.handle.toBytes(), 32);
    const remainingCiphertext = ElGamalCiphertext.fromBytes(remaining);
    if (!remainingCiphertext) throw new Error("Could not rebuild the new balance ciphertext.");
    own(remainingCiphertext);

    const equality = own(new CiphertextCommitmentEqualityProofData(keypair, remainingCiphertext, commitment, opening, newBalance));
    const range = own(new BatchedRangeProofU64Data([commitment], BigUint64Array.of(newBalance), Uint8Array.of(REMAINING_BALANCE_BITS), [opening]));

    return { equality: equality.toBytes(), range: range.toBytes(), newBalance };
  } finally {
    for (const o of owned) {
      try {
        o.free();
      } catch {
        /* already freed */
      }
    }
  }
}
