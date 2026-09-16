import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { ZK_ELGAMAL_PROOF_PROGRAM_ID } from "./constants.js";

/**
 * Mirrors solana-zk-sdk's `ProofInstruction` enum exactly (discriminants
 * are implicit `#[repr(u8)]` ordinal values in the Rust source -- see
 * CLAUDE.md for how these were confirmed).
 */
export enum ProofInstructionDiscriminant {
  CloseContextState = 0,
  VerifyZeroCiphertext = 1,
  VerifyCiphertextCiphertextEquality = 2,
  VerifyCiphertextCommitmentEquality = 3,
  VerifyPubkeyValidity = 4,
  VerifyPercentageWithCap = 5,
  VerifyBatchedRangeProofU64 = 6,
  VerifyBatchedRangeProofU128 = 7,
  VerifyBatchedRangeProofU256 = 8,
  VerifyGroupedCiphertext2HandlesValidity = 9,
  VerifyBatchedGroupedCiphertext2HandlesValidity = 10,
  VerifyGroupedCiphertext3HandlesValidity = 11,
  VerifyBatchedGroupedCiphertext3HandlesValidity = 12,
}

interface ProofDataLike {
  toBytes(): Uint8Array;
  context(): { toBytes(): Uint8Array };
}

/**
 * Builds a `VerifyProof` instruction against the ZK ElGamal Proof program.
 * With `contextStateAccount`/`contextStateAuthority`, the proof gets
 * verified and its context written into that (already-created,
 * already-funded) account rather than just checked in place.
 */
export function encodeVerifyProofInstruction(
  discriminant: ProofInstructionDiscriminant,
  proofData: { toBytes(): Uint8Array },
  contextStateAccount?: PublicKey,
  contextStateAuthority?: PublicKey,
): TransactionInstruction {
  const keys = [];
  if (contextStateAccount && contextStateAuthority) {
    keys.push(
      { pubkey: contextStateAccount, isSigner: false, isWritable: true },
      { pubkey: contextStateAuthority, isSigner: false, isWritable: false },
    );
  }
  const data = Buffer.concat([
    Buffer.from([discriminant]),
    Buffer.from(proofData.toBytes()),
  ]);
  return new TransactionInstruction({
    programId: ZK_ELGAMAL_PROOF_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Creates a fresh context-state account (a plain, non-PDA account -- the
 * client generates the keypair and signs for its creation) and populates it
 * with `proofData` via a `VerifyProof` instruction.
 * `transfer_confidential`/`withdraw_confidential` then reference the
 * returned address by `ProofLocation::ContextStateAccount` on the program
 * side.
 *
 * Sent as **two separate transactions** (create, then populate) rather
 * than one -- unlike litesvm (which doesn't enforce the real wire-format
 * transaction-size limit), a real validator rejects `[create_account,
 * verify_proof]` combined in one transaction for most of these proof types
 * with "Transaction too large: N > 1232", confirmed by running this
 * against surfpool. This is the real-network version of the same
 * transaction-size constraint already documented in `CLAUDE.md` for
 * `batch_pay`/confidential transfers generally -- proofs plus even a small
 * second instruction routinely don't fit together.
 */
export async function createProofContextAccount(
  connection: Connection,
  payer: Keypair,
  discriminant: ProofInstructionDiscriminant,
  proofData: ProofDataLike,
): Promise<PublicKey> {
  const contextKeypair = Keypair.generate();
  const contextDataLen = 32 + 1 + proofData.context().toBytes().length;
  const lamports = await connection.getMinimumBalanceForRentExemption(contextDataLen);

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: contextKeypair.publicKey,
    lamports,
    space: contextDataLen,
    programId: ZK_ELGAMAL_PROOF_PROGRAM_ID,
  });

  const createTx = new Transaction().add(createAccountIx);
  const createSig = await connection.sendTransaction(createTx, [payer, contextKeypair]);
  await connection.confirmTransaction(createSig, "confirmed");

  const verifyProofIx = encodeVerifyProofInstruction(
    discriminant,
    proofData,
    contextKeypair.publicKey,
    payer.publicKey,
  );

  const verifyTx = new Transaction().add(verifyProofIx);
  const verifySig = await connection.sendTransaction(verifyTx, [payer]);
  await connection.confirmTransaction(verifySig, "confirmed");

  return contextKeypair.publicKey;
}
