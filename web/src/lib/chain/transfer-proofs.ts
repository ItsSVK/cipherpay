// CLIENT-ONLY. Composes the three proofs a confidential Transfer needs (equality, ciphertext-validity, range),
// ported from client/src/lib/confidentialTransferProofs.ts (proven on surfpool and devnet) and from
// spl-token-confidential-transfer-proof-generation's transfer.rs. @solana/zk-sdk has no homomorphic add/subtract, so
// the two ciphertext operations we need are done on the raw 64-byte encoding (32-byte commitment || 32-byte handle)
// with @noble/curves' Ristretto255, the same curve the on-chain program uses.
import { ristretto255 } from "@noble/curves/ed25519.js";

const LO_BITS = 16;
const HI_BITS = 32;
const REMAINING_BALANCE_BITS = 64;
const RANGE_PADDING_BITS = 16;

type Point = ReturnType<typeof ristretto255.Point.fromBytes>;

export interface TransferProofInput {
  /** The source (treasury) account's current available-balance ElGamal ciphertext, 64 bytes, as stored on-chain. */
  currentAvailableCiphertext: Uint8Array;
  /** That same balance in plaintext (decrypted with the AES key). Must equal what the ciphertext encrypts. */
  currentBalance: bigint;
  amount: bigint;
  /** The source's ElGamal secret key (32 bytes). */
  sourceSecretKey: Uint8Array;
  /** The destination account's registered ElGamal public key (32 bytes). */
  destinationPubkey: Uint8Array;
  /** The mint's registered auditor ElGamal public key (32 bytes). A mismatch makes Token-2022 reject the transfer. */
  auditorPubkey: Uint8Array;
}

export interface TransferProofs {
  equality: Uint8Array;
  validity: Uint8Array;
  range: Uint8Array;
  /** The amount's low 16 bits and high bits, each encrypted to the auditor. The auditor recovers amount = lo + hi * 2^16. */
  auditorCiphertextLo: Uint8Array;
  auditorCiphertextHi: Uint8Array;
  /** The same two halves encrypted to the recipient (what Token-2022 adds to its pending balance). Kept so the recipient can read each payment. */
  destinationCiphertextLo: Uint8Array;
  destinationCiphertextHi: Uint8Array;
  newBalance: bigint;
}

function splitU64(amount: bigint): [bigint, bigint] {
  return [amount & ((1n << BigInt(LO_BITS)) - 1n), amount >> BigInt(LO_BITS)];
}

const points = (b: Uint8Array): { commitment: Point; handle: Point } => ({ commitment: ristretto255.Point.fromBytes(b.subarray(0, 32)), handle: ristretto255.Point.fromBytes(b.subarray(32, 64)) });
const toBytes = (commitment: Point, handle: Point) => {
  const out = new Uint8Array(64);
  out.set(commitment.toBytes(), 0);
  out.set(handle.toBytes(), 32);
  return out;
};

/** lo + hi * 2^bits, at the ciphertext level. */
function combineLoHi(lo: Uint8Array, hi: Uint8Array, bits: number): Uint8Array {
  const scalar = 1n << BigInt(bits);
  const l = points(lo);
  const h = points(hi);
  return toBytes(l.commitment.add(h.commitment.multiply(scalar)), l.handle.add(h.handle.multiply(scalar)));
}

function subtract(a: Uint8Array, b: Uint8Array): Uint8Array {
  const x = points(a);
  const y = points(b);
  return toBytes(x.commitment.subtract(y.commitment), x.handle.subtract(y.handle));
}

export async function composeTransferProofs(input: TransferProofInput): Promise<TransferProofs> {
  const { amount, currentBalance } = input;
  if (amount <= 0n) throw new Error("The amount must be greater than zero.");
  if (amount >= 1n << 64n) throw new Error("The amount is too large.");
  if (amount > currentBalance) throw new Error("The amount is more than the treasury's available balance.");

  const zk = await import("@solana/zk-sdk/bundler");
  const { BatchedGroupedCiphertext3HandlesValidityProofData, BatchedRangeProofU128Data, CiphertextCommitmentEqualityProofData, ElGamalCiphertext, ElGamalKeypair, ElGamalPubkey, ElGamalSecretKey, GroupedElGamalCiphertext3Handles, PedersenCommitment, PedersenOpening } = zk;

  // Everything we allocate in WASM memory is freed at the end, whether or not a proof fails.
  const owned: { free(): void }[] = [];
  const own = <T extends { free(): void }>(x: T): T => (owned.push(x), x);
  try {
    const secret = own(ElGamalSecretKey.fromBytes(input.sourceSecretKey));
    const sourceKeypair = own(ElGamalKeypair.fromSecretKey(secret));
    const sourcePubkey = own(sourceKeypair.pubkey());
    const destinationPubkey = own(ElGamalPubkey.fromBytes(input.destinationPubkey));
    const auditorPubkey = own(ElGamalPubkey.fromBytes(input.auditorPubkey));

    const [amountLo, amountHi] = splitU64(amount);
    const openingLo = own(new PedersenOpening());
    const openingHi = own(new PedersenOpening());

    const groupedLo = own(GroupedElGamalCiphertext3Handles.encryptWith(sourcePubkey, destinationPubkey, auditorPubkey, amountLo, openingLo));
    const groupedHi = own(GroupedElGamalCiphertext3Handles.encryptWith(sourcePubkey, destinationPubkey, auditorPubkey, amountHi, openingHi));

    // A fresh encryption with the same (amount, opening) is byte-identical to extracting that handle from the grouped ciphertext.
    const sourceCtLo = own(sourcePubkey.encryptWith(amountLo, openingLo));
    const sourceCtHi = own(sourcePubkey.encryptWith(amountHi, openingHi));
    const auditorCtLo = own(auditorPubkey.encryptWith(amountLo, openingLo));
    const auditorCtHi = own(auditorPubkey.encryptWith(amountHi, openingHi));
    const destinationCtLo = own(destinationPubkey.encryptWith(amountLo, openingLo));
    const destinationCtHi = own(destinationPubkey.encryptWith(amountHi, openingHi));

    const newBalance = currentBalance - amount;
    const newOpening = own(new PedersenOpening());
    const newCommitment = own(PedersenCommitment.from(newBalance, newOpening));

    const newAvailableCiphertext = own(
      (() => {
        const ct = ElGamalCiphertext.fromBytes(subtract(input.currentAvailableCiphertext, combineLoHi(sourceCtLo.toBytes(), sourceCtHi.toBytes(), LO_BITS)));
        if (!ct) throw new Error("Could not rebuild the new balance ciphertext.");
        return ct;
      })(),
    );

    const equality = own(new CiphertextCommitmentEqualityProofData(sourceKeypair, newAvailableCiphertext, newCommitment, newOpening, newBalance));
    const validity = own(new BatchedGroupedCiphertext3HandlesValidityProofData(sourcePubkey, destinationPubkey, auditorPubkey, groupedLo, groupedHi, amountLo, amountHi, openingLo, openingHi));

    const paddingOpening = own(new PedersenOpening());
    const paddingCommitment = own(PedersenCommitment.from(0n, paddingOpening));
    const commitmentLo = own(sourceCtLo.commitment());
    const commitmentHi = own(sourceCtHi.commitment());
    const range = own(
      new BatchedRangeProofU128Data(
        [newCommitment, commitmentLo, commitmentHi, paddingCommitment],
        BigUint64Array.of(newBalance, amountLo, amountHi, 0n),
        Uint8Array.of(REMAINING_BALANCE_BITS, LO_BITS, HI_BITS, RANGE_PADDING_BITS),
        [newOpening, openingLo, openingHi, paddingOpening],
      ),
    );

    return {
      equality: equality.toBytes(),
      validity: validity.toBytes(),
      range: range.toBytes(),
      auditorCiphertextLo: auditorCtLo.toBytes(),
      auditorCiphertextHi: auditorCtHi.toBytes(),
      destinationCiphertextLo: destinationCtLo.toBytes(),
      destinationCiphertextHi: destinationCtHi.toBytes(),
      newBalance,
    };
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
