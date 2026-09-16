import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
  WRAPPED_MINT_AUTHORITY_SEED,
  WRAPPED_MINT_BACKPOINTER_SEED,
  WRAPPED_MINT_SEED,
} from "./constants.js";

/** Mirrors token_wrap_compliance's get_wrapped_mint_address. */
export function wrappedMintPda(
  unwrappedMint: PublicKey,
  wrappedTokenProgram: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [WRAPPED_MINT_SEED, unwrappedMint.toBuffer(), wrappedTokenProgram.toBuffer()],
    TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
  );
}

/** Mirrors token_wrap_compliance's get_wrapped_mint_authority. */
export function wrappedMintAuthorityPda(wrappedMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [WRAPPED_MINT_AUTHORITY_SEED, wrappedMint.toBuffer()],
    TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
  );
}

/** Mirrors token_wrap_compliance's get_wrapped_mint_backpointer_address. */
export function wrappedMintBackpointerPda(wrappedMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [WRAPPED_MINT_BACKPOINTER_SEED, wrappedMint.toBuffer()],
    TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
  );
}

/** Mirrors token_wrap_compliance's get_escrow_address. */
export function escrowAddress(
  unwrappedMint: PublicKey,
  unwrappedTokenProgram: PublicKey,
  wrappedTokenProgram: PublicKey,
): PublicKey {
  const [wrappedMint] = wrappedMintPda(unwrappedMint, wrappedTokenProgram);
  const [wrappedMintAuthority] = wrappedMintAuthorityPda(wrappedMint);
  return getAssociatedTokenAddressSync(
    unwrappedMint,
    wrappedMintAuthority,
    true,
    unwrappedTokenProgram,
  );
}
