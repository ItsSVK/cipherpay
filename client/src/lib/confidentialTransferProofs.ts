// Client-side proof composition for `transfer_confidential` (three proofs:
// equality, ciphertext-validity, range) and `withdraw_confidential` (two:
// equality, range) -- the TS mirror of
// `spl-token-confidential-transfer-proof-generation`'s `transfer.rs`/
// `withdraw.rs`, which this project's Rust test suite already depends on
// directly (no TS equivalent of that crate exists yet, so this
// re-implements its composition logic using `@solana/zk-sdk`'s WASM
// bindings for the individual proof/encryption primitives).
//
// One real gap in `@solana/zk-sdk` (as of 0.5.3) forced a workaround:
// `ElGamalCiphertext` doesn't expose homomorphic add/subtract/scalar-multiply
// (unlike the Rust `solana-zk-sdk`, which implements these via operator
// overloads), and `GroupedElGamalCiphertext3Handles` doesn't expose
// extracting a single handle's `ElGamalCiphertext` or its shared
// commitment. Both operations are needed to compute the new balance
// ciphertext (`current_available_balance - transfer_amount_ciphertext`) and
// to combine lo/hi ciphertexts (`lo + hi * 2^bits`). Fixed by doing the
// underlying Ristretto255 point arithmetic directly via `@noble/curves`
// (a well-vetted, standard-compliant implementation of the same curve
// `curve25519-dalek` uses) on the raw 64-byte `ElGamalCiphertext` encoding
// (32-byte commitment || 32-byte decrypt handle) -- see `ctToPoints`/
// `pointsToCt` below. This is why per-handle ciphertexts (auditor's, and
// the source's own) are independently re-derived via
// `pubkey.encryptWith(amount, opening)` with the *same* opening used for
// the grouped ciphertext, rather than "extracted" from it: a fresh
// encryption with the same (amount, opening) pair is byte-for-byte
// identical to what extraction would give, since the Pedersen commitment
// only depends on (amount, opening), and each handle only depends on
// (opening, that specific pubkey).
import { ristretto255 } from "@noble/curves/ed25519.js";
import {
  BatchedGroupedCiphertext3HandlesValidityProofData,
  BatchedRangeProofU128Data,
  BatchedRangeProofU64Data,
  CiphertextCommitmentEqualityProofData,
  ElGamalCiphertext,
  ElGamalKeypair,
  ElGamalPubkey,
  GroupedElGamalCiphertext3Handles,
  PedersenCommitment,
  PedersenOpening,
} from "@solana/zk-sdk";

const TRANSFER_AMOUNT_LO_BITS = 16;
const TRANSFER_AMOUNT_HI_BITS = 32;
const REMAINING_BALANCE_BIT_LENGTH = 64;
const RANGE_PROOF_PADDING_BIT_LENGTH = 16;

function splitU64(amount: bigint, loBits: number): [bigint, bigint] {
  const mask = (1n << BigInt(loBits)) - 1n;
  return [amount & mask, amount >> BigInt(loBits)];
}

function ctToPoints(ct: ElGamalCiphertext) {
  const bytes = ct.toBytes();
  return {
    commitment: ristretto255.Point.fromBytes(bytes.subarray(0, 32)),
    handle: ristretto255.Point.fromBytes(bytes.subarray(32, 64)),
  };
}

function pointsToCt(
  commitment: ReturnType<typeof ristretto255.Point.fromBytes>,
  handle: ReturnType<typeof ristretto255.Point.fromBytes>,
): ElGamalCiphertext {
  const bytes = new Uint8Array(64);
  bytes.set(commitment.toBytes(), 0);
  bytes.set(handle.toBytes(), 32);
  const ct = ElGamalCiphertext.fromBytes(bytes);
  if (!ct) throw new Error("failed to reconstruct ElGamalCiphertext from combined points");
  return ct;
}

/** `lo + hi * 2^bitLength`, at the ciphertext level. */
function combineLoHiCiphertext(
  lo: ElGamalCiphertext,
  hi: ElGamalCiphertext,
  bitLength: number,
): ElGamalCiphertext {
  const scalar = 1n << BigInt(bitLength);
  const loPts = ctToPoints(lo);
  const hiPts = ctToPoints(hi);
  return pointsToCt(
    loPts.commitment.add(hiPts.commitment.multiply(scalar)),
    loPts.handle.add(hiPts.handle.multiply(scalar)),
  );
}

function subtractCiphertexts(a: ElGamalCiphertext, b: ElGamalCiphertext): ElGamalCiphertext {
  const aPts = ctToPoints(a);
  const bPts = ctToPoints(b);
  return pointsToCt(
    aPts.commitment.subtract(bPts.commitment),
    aPts.handle.subtract(bPts.handle),
  );
}

/**
 * `ElGamal::encode(amount)`: a "ciphertext" with no real encryption --
 * a Pedersen commitment to `amount` with a zero opening (no blinding), and
 * a zero (identity) decrypt handle. Used only for `withdraw`'s
 * `current_available_balance - encode(withdraw_amount)` subtraction.
 */
function encodeAmountAsCiphertext(amount: bigint): ElGamalCiphertext {
  const commitment = PedersenCommitment.from(amount, PedersenOpening.zero());
  return pointsToCt(
    ristretto255.Point.fromBytes(commitment.toBytes()),
    ristretto255.Point.ZERO,
  );
}

export interface TransferProofResult {
  equalityProofData: CiphertextCommitmentEqualityProofData;
  ciphertextValidityProofData: BatchedGroupedCiphertext3HandlesValidityProofData;
  transferAmountAuditorCiphertextLo: Uint8Array;
  transferAmountAuditorCiphertextHi: Uint8Array;
  rangeProofData: BatchedRangeProofU128Data;
  newSourceDecryptableAvailableBalance: bigint;
}

/**
 * TS mirror of `spl-token-confidential-transfer-proof-generation`'s
 * `transfer::transfer_split_proof_data`. Splits `amount` into 16/32-bit
 * lo/hi components, encrypts each under the source/destination/auditor
 * ElGamal pubkeys, and builds the three proofs Token-2022's `Transfer`
 * needs. `auditorPubkey` must match whatever's actually registered on the
 * mint -- see `constants.ts`'s `COMPLIANCE_AUDITOR_ELGAMAL_PUBKEY_BYTES`
 * for the wrapped-mint case; get this wrong and Token-2022 rejects the
 * transfer with "ElGamal public key mismatch", not a silent miscalculation.
 */
export function transferSplitProofData(
  currentAvailableBalance: ElGamalCiphertext,
  currentBalance: bigint,
  transferAmount: bigint,
  sourceKeypair: ElGamalKeypair,
  destinationPubkey: ElGamalPubkey,
  auditorPubkey: ElGamalPubkey,
): TransferProofResult {
  const sourcePubkey = sourceKeypair.pubkey();
  const [amountLo, amountHi] = splitU64(transferAmount, TRANSFER_AMOUNT_LO_BITS);

  const openingLo = new PedersenOpening();
  const openingHi = new PedersenOpening();

  const groupedCiphertextLo = GroupedElGamalCiphertext3Handles.encryptWith(
    sourcePubkey,
    destinationPubkey,
    auditorPubkey,
    amountLo,
    openingLo,
  );
  const groupedCiphertextHi = GroupedElGamalCiphertext3Handles.encryptWith(
    sourcePubkey,
    destinationPubkey,
    auditorPubkey,
    amountHi,
    openingHi,
  );

  const sourceCiphertextLo = sourcePubkey.encryptWith(amountLo, openingLo);
  const sourceCiphertextHi = sourcePubkey.encryptWith(amountHi, openingHi);
  const auditorCiphertextLo = auditorPubkey.encryptWith(amountLo, openingLo);
  const auditorCiphertextHi = auditorPubkey.encryptWith(amountHi, openingHi);

  const newBalance = currentBalance - transferAmount;
  if (newBalance < 0n) throw new Error("transfer amount exceeds current available balance");

  const newSourceOpening = new PedersenOpening();
  const newAvailableBalanceCommitment = PedersenCommitment.from(newBalance, newSourceOpening);

  const combinedSourceCiphertext = combineLoHiCiphertext(
    sourceCiphertextLo,
    sourceCiphertextHi,
    TRANSFER_AMOUNT_LO_BITS,
  );
  const newAvailableBalanceCiphertext = subtractCiphertexts(
    currentAvailableBalance,
    combinedSourceCiphertext,
  );

  const equalityProofData = new CiphertextCommitmentEqualityProofData(
    sourceKeypair,
    newAvailableBalanceCiphertext,
    newAvailableBalanceCommitment,
    newSourceOpening,
    newBalance,
  );

  const ciphertextValidityProofData = new BatchedGroupedCiphertext3HandlesValidityProofData(
    sourcePubkey,
    destinationPubkey,
    auditorPubkey,
    groupedCiphertextLo,
    groupedCiphertextHi,
    amountLo,
    amountHi,
    openingLo,
    openingHi,
  );

  const paddingOpening = new PedersenOpening();
  const paddingCommitment = PedersenCommitment.from(0n, paddingOpening);

  const rangeProofData = new BatchedRangeProofU128Data(
    [
      newAvailableBalanceCommitment,
      sourceCiphertextLo.commitment(),
      sourceCiphertextHi.commitment(),
      paddingCommitment,
    ],
    BigUint64Array.of(newBalance, amountLo, amountHi, 0n),
    Uint8Array.of(
      REMAINING_BALANCE_BIT_LENGTH,
      TRANSFER_AMOUNT_LO_BITS,
      TRANSFER_AMOUNT_HI_BITS,
      RANGE_PROOF_PADDING_BIT_LENGTH,
    ),
    [newSourceOpening, openingLo, openingHi, paddingOpening],
  );

  return {
    equalityProofData,
    ciphertextValidityProofData,
    transferAmountAuditorCiphertextLo: auditorCiphertextLo.toBytes(),
    transferAmountAuditorCiphertextHi: auditorCiphertextHi.toBytes(),
    rangeProofData,
    newSourceDecryptableAvailableBalance: newBalance,
  };
}


export interface WithdrawProofResult {
  equalityProofData: CiphertextCommitmentEqualityProofData;
  rangeProofData: BatchedRangeProofU64Data;
  newDecryptableAvailableBalance: bigint;
}

/**
 * TS mirror of `spl-token-confidential-transfer-proof-generation`'s
 * `withdraw::withdraw_proof_data`. No auditor or ciphertext-validity proof
 * involved -- withdrawing doesn't create any new encrypted-amount
 * ciphertext for a second party, it just discloses a plaintext amount and
 * shrinks the existing balance ciphertext.
 */
export function withdrawProofData(
  currentAvailableBalance: ElGamalCiphertext,
  currentBalance: bigint,
  withdrawAmount: bigint,
  keypair: ElGamalKeypair,
): WithdrawProofResult {
  const remainingBalance = currentBalance - withdrawAmount;
  if (remainingBalance < 0n) throw new Error("withdraw amount exceeds current available balance");

  const remainingBalanceOpening = new PedersenOpening();
  const remainingBalanceCommitment = PedersenCommitment.from(
    remainingBalance,
    remainingBalanceOpening,
  );

  const remainingBalanceCiphertext = subtractCiphertexts(
    currentAvailableBalance,
    encodeAmountAsCiphertext(withdrawAmount),
  );

  const equalityProofData = new CiphertextCommitmentEqualityProofData(
    keypair,
    remainingBalanceCiphertext,
    remainingBalanceCommitment,
    remainingBalanceOpening,
    remainingBalance,
  );

  const rangeProofData = new BatchedRangeProofU64Data(
    [remainingBalanceCommitment],
    BigUint64Array.of(remainingBalance),
    Uint8Array.of(REMAINING_BALANCE_BIT_LENGTH),
    [remainingBalanceOpening],
  );

  return {
    equalityProofData,
    rangeProofData,
    newDecryptableAvailableBalance: remainingBalance,
  };
}
