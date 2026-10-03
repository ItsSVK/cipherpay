//! PDA derivation helpers, mirroring the seeds used in the program itself.

use solana_address::Address;

use crate::common::env::{to_address, to_anchor_pubkey};

/// Derives the vault PDA for `(authority, mint)`.
pub fn vault_pda(authority: Address, mint: Address) -> (Address, u8) {
    Address::find_program_address(
        &[vault::VAULT_SEED, authority.as_ref(), mint.as_ref()],
        &to_address(vault::ID),
    )
}

/// Derives `token_wrap_compliance`'s wrapped-mint PDA. Must mirror
/// `native_programs/token_wrap_compliance/src/lib.rs`'s
/// `get_wrapped_mint_address` exactly.
pub fn wrapped_mint_pda(unwrapped_mint: Address, wrapped_token_program: Address) -> (Address, u8) {
    Address::find_program_address(
        &[
            vault::WRAPPED_MINT_SEED,
            unwrapped_mint.as_ref(),
            wrapped_token_program.as_ref(),
        ],
        &to_address(vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID),
    )
}

/// Derives `token_wrap_compliance`'s wrapped-mint-authority PDA. Must mirror
/// `get_wrapped_mint_authority`.
pub fn wrapped_mint_authority_pda(wrapped_mint: Address) -> (Address, u8) {
    Address::find_program_address(
        &[vault::WRAPPED_MINT_AUTHORITY_SEED, wrapped_mint.as_ref()],
        &to_address(vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID),
    )
}

/// Derives `token_wrap_compliance`'s wrapped-mint-backpointer PDA. Must
/// mirror `get_wrapped_mint_backpointer_address`. Only needed for the
/// one-time `CreateMint` bootstrap in tests.
pub fn wrapped_mint_backpointer_pda(wrapped_mint: Address) -> (Address, u8) {
    Address::find_program_address(
        &[b"backpointer", wrapped_mint.as_ref()],
        &to_address(vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID),
    )
}

/// Derives the escrow ATA that custodies a wrapped mint's real-asset
/// backing. Must mirror `get_escrow_address` (owner = the wrapped mint
/// authority PDA, mint = the unwrapped mint, token program = the unwrapped
/// mint's own token program).
pub fn escrow_address(
    unwrapped_mint: Address,
    unwrapped_token_program: Address,
    wrapped_token_program: Address,
) -> Address {
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let (wrapped_mint_authority, _bump) = wrapped_mint_authority_pda(wrapped_mint);

    to_address(anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &to_anchor_pubkey(wrapped_mint_authority),
        &to_anchor_pubkey(unwrapped_mint),
        &to_anchor_pubkey(unwrapped_token_program),
    ))
}
