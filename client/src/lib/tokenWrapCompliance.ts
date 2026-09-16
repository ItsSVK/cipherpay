import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_WRAP_COMPLIANCE_PROGRAM_ID } from "./constants.js";
import {
  wrappedMintAuthorityPda,
  wrappedMintBackpointerPda,
  wrappedMintPda,
} from "./pdas.js";

/**
 * Builds token_wrap_compliance's CreateMint instruction. Account order and
 * data encoding must match
 * native_programs/token_wrap_compliance/src/instruction.rs's CreateMint
 * variant exactly. This is a one-time, per-(unwrappedMint,
 * wrappedTokenProgram) bootstrap -- not wired into vault at all, same as
 * the Rust test suite's tests/common/token_wrap.rs.
 */
function buildCreateMintIx(
  unwrappedMint: PublicKey,
  wrappedTokenProgram: PublicKey,
  idempotent: boolean,
): TransactionInstruction {
  const [wrappedMint] = wrappedMintPda(unwrappedMint, wrappedTokenProgram);
  const [wrappedBackpointer] = wrappedMintBackpointerPda(wrappedMint);

  return new TransactionInstruction({
    programId: TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
    keys: [
      { pubkey: wrappedMint, isSigner: false, isWritable: true },
      { pubkey: wrappedBackpointer, isSigner: false, isWritable: true },
      { pubkey: unwrappedMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: wrappedTokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0, idempotent ? 1 : 0]),
  });
}

/**
 * CreateMint's processor only `allocate`s + `assign`s the wrapped-mint and
 * backpointer PDAs -- it doesn't fund them, so the caller must pre-fund
 * both with rent-exempt lamports first. Generously over-funds rather than
 * computing exact extension-dependent sizes (harmless -- see the matching
 * Rust helper, tests/common/token_wrap.rs).
 */
const WRAPPED_MINT_FUNDING_LAMPORTS = 10_000_000;
const BACKPOINTER_FUNDING_LAMPORTS = 10_000_000;

/** Bootstraps the wrapped mint for (unwrappedMint, wrappedTokenProgram). */
export async function createWrappedMint(
  connection: Connection,
  payer: Keypair,
  unwrappedMint: PublicKey,
  wrappedTokenProgram: PublicKey,
): Promise<{ wrappedMint: PublicKey; wrappedMintAuthority: PublicKey }> {
  const [wrappedMint] = wrappedMintPda(unwrappedMint, wrappedTokenProgram);
  const [wrappedBackpointer] = wrappedMintBackpointerPda(wrappedMint);
  const [wrappedMintAuthority] = wrappedMintAuthorityPda(wrappedMint);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wrappedMint,
      lamports: WRAPPED_MINT_FUNDING_LAMPORTS,
    }),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wrappedBackpointer,
      lamports: BACKPOINTER_FUNDING_LAMPORTS,
    }),
    buildCreateMintIx(unwrappedMint, wrappedTokenProgram, true),
  );

  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");

  return { wrappedMint, wrappedMintAuthority };
}
