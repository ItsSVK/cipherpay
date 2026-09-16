//! Fork of `spl-token-wrap` (https://github.com/solana-program/token-wrap)
//! with `ComplianceMintCustomizer` wired in at the `CreateMint` dispatch
//! point instead of the upstream `DefaultToken2022Customizer`. Forking (vs.
//! calling a shared deployment) is the upstream-documented way to customize
//! this program -- see `mint_customizer/interface.rs`. It's also currently
//! the only way to use this program at all: as of 2026-09-15,
//! `TwRapQCDhWkZRrDaHfZGuHxkZ91gHDRkyuzNqeU5MgR` (upstream's declared ID)
//! isn't deployed on mainnet, devnet, or testnet -- confirmed directly via
//! `getAccountInfo` against all three, not just absence from an explorer UI.
#![deny(missing_docs)]
#![forbid(unsafe_code)]

mod entrypoint;
pub mod error;
pub mod instruction;
pub mod metadata;
pub mod metaplex;
pub mod mint_customizer;
pub mod processor;
pub mod state;

use {
    solana_pubkey::Pubkey,
    spl_associated_token_account_client::address::get_associated_token_address_with_program_id,
};

// Our own fresh program keypair -- we don't hold the private key for
// upstream's `TwRapQCDh...` vanity address, and since PDAs throughout this
// crate are derived from `&id()`, this constant must match wherever this
// binary is actually deployed (see `token_wrap_compliance-keypair.json`).
solana_pubkey::declare_id!("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");

const WRAPPED_MINT_SEED: &[u8] = br"mint";

pub(crate) fn get_wrapped_mint_address_with_seed(
    unwrapped_mint: &Pubkey,
    wrapped_token_program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &get_wrapped_mint_seeds(unwrapped_mint, wrapped_token_program_id),
        &id(),
    )
}

pub(crate) fn get_wrapped_mint_seeds<'a>(
    unwrapped_mint: &'a Pubkey,
    wrapped_token_program_id: &'a Pubkey,
) -> [&'a [u8]; 3] {
    [
        WRAPPED_MINT_SEED,
        unwrapped_mint.as_ref(),
        wrapped_token_program_id.as_ref(),
    ]
}

pub(crate) fn get_wrapped_mint_signer_seeds<'a>(
    unwrapped_mint: &'a Pubkey,
    wrapped_token_program_id: &'a Pubkey,
    bump_seed: &'a [u8],
) -> [&'a [u8]; 4] {
    [
        WRAPPED_MINT_SEED,
        unwrapped_mint.as_ref(),
        wrapped_token_program_id.as_ref(),
        bump_seed,
    ]
}

/// Derive the SPL Token wrapped mint address associated with an unwrapped mint
pub fn get_wrapped_mint_address(
    unwrapped_mint: &Pubkey,
    wrapped_token_program_id: &Pubkey,
) -> Pubkey {
    get_wrapped_mint_address_with_seed(unwrapped_mint, wrapped_token_program_id).0
}

const WRAPPED_MINT_AUTHORITY_SEED: &[u8] = br"authority";

pub(crate) fn get_wrapped_mint_authority_seeds(wrapped_mint: &Pubkey) -> [&[u8]; 2] {
    [WRAPPED_MINT_AUTHORITY_SEED, wrapped_mint.as_ref()]
}

pub(crate) fn get_wrapped_mint_authority_signer_seeds<'a>(
    wrapped_mint: &'a Pubkey,
    bump_seed: &'a [u8],
) -> [&'a [u8]; 3] {
    [
        WRAPPED_MINT_AUTHORITY_SEED,
        wrapped_mint.as_ref(),
        bump_seed,
    ]
}

pub(crate) fn get_wrapped_mint_authority_with_seed(wrapped_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&get_wrapped_mint_authority_seeds(wrapped_mint), &id())
}

/// Derive the SPL Token wrapped mint authority address
pub fn get_wrapped_mint_authority(wrapped_mint: &Pubkey) -> Pubkey {
    get_wrapped_mint_authority_with_seed(wrapped_mint).0
}

const WRAPPED_MINT_BACKPOINTER_SEED: &[u8] = br"backpointer";

pub(crate) fn get_wrapped_mint_backpointer_address_seeds(wrapped_mint: &Pubkey) -> [&[u8]; 2] {
    [WRAPPED_MINT_BACKPOINTER_SEED, wrapped_mint.as_ref()]
}

pub(crate) fn get_wrapped_mint_backpointer_address_signer_seeds<'a>(
    wrapped_mint: &'a Pubkey,
    bump_seed: &'a [u8],
) -> [&'a [u8]; 3] {
    [
        WRAPPED_MINT_BACKPOINTER_SEED,
        wrapped_mint.as_ref(),
        bump_seed,
    ]
}

pub(crate) fn get_wrapped_mint_backpointer_address_with_seed(
    wrapped_mint: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &get_wrapped_mint_backpointer_address_seeds(wrapped_mint),
        &id(),
    )
}

/// Derive the SPL Token wrapped mint backpointer address
pub fn get_wrapped_mint_backpointer_address(wrapped_mint: &Pubkey) -> Pubkey {
    get_wrapped_mint_backpointer_address_with_seed(wrapped_mint).0
}

/// Derive the escrow `ATA` that backs a given wrapped mint.
pub fn get_escrow_address(
    unwrapped_mint: &Pubkey,
    unwrapped_token_program_id: &Pubkey,
    wrapped_token_program_id: &Pubkey,
) -> Pubkey {
    let wrapped_mint = get_wrapped_mint_address(unwrapped_mint, wrapped_token_program_id);
    let mint_authority = get_wrapped_mint_authority(&wrapped_mint);

    get_associated_token_address_with_program_id(
        &mint_authority,
        unwrapped_mint,
        unwrapped_token_program_id,
    )
}
