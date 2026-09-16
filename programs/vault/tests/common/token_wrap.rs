//! Test-only bootstrap for `native_programs/token_wrap_compliance`: building
//! and sending its one-time `CreateMint` instruction so a wrapped mint
//! exists before `wrap_confidential`/`unwrap_confidential` tests run.
//!
//! Not part of `vault`'s own instruction set (see `ix.rs`) -- `CreateMint`
//! is a per-(unwrapped_mint, wrapped_token_program) setup step, not
//! something `vault` wires in, so it's hand-built directly against
//! `token_wrap_compliance`'s known wire format rather than going through
//! `vault` at all. Same reasoning as `wrap_confidential`'s CPI: this
//! program's pinned Pubkey/Instruction versions are a different,
//! incompatible chain from litesvm's, so its own builder functions can't be
//! used directly here either.

use anchor_lang::solana_program::system_instruction;
use litesvm::LiteSVM;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;

use crate::common::{
    env::to_address,
    ix::send,
    pda::{wrapped_mint_authority_pda, wrapped_mint_backpointer_pda, wrapped_mint_pda},
};

fn system_program_address() -> Address {
    to_address(anchor_lang::solana_program::system_program::ID)
}

/// Builds `token_wrap_compliance`'s `CreateMint` instruction. Account order
/// and data encoding must match
/// `native_programs/token_wrap_compliance/src/instruction.rs`'s `CreateMint`
/// variant exactly.
pub fn build_create_mint_ix(
    unwrapped_mint: Address,
    wrapped_token_program: Address,
    idempotent: bool,
) -> Instruction {
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let (wrapped_backpointer, _bump) = wrapped_mint_backpointer_pda(wrapped_mint);

    Instruction {
        program_id: to_address(vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID),
        accounts: vec![
            AccountMeta::new(wrapped_mint, false),
            AccountMeta::new(wrapped_backpointer, false),
            AccountMeta::new_readonly(unwrapped_mint, false),
            AccountMeta::new_readonly(system_program_address(), false),
            AccountMeta::new_readonly(wrapped_token_program, false),
        ],
        data: {
            let mut data = vec![0u8];
            data.push(if idempotent { 1 } else { 0 });
            data
        },
    }
}

/// `CreateMint` requires the wrapped-mint and backpointer PDAs to already
/// be rent-exempt (it only `allocate`s/`assign`s them, it doesn't fund
/// them -- the caller must transfer lamports in first). Generously
/// over-funds both rather than computing exact extension-dependent sizes;
/// over-funding a PDA that's about to be `allocate`d into a smaller account
/// is harmless.
const WRAPPED_MINT_FUNDING_LAMPORTS: u64 = 10_000_000;
const BACKPOINTER_FUNDING_LAMPORTS: u64 = 10_000_000;

/// Sends `CreateMint`, bootstrapping the wrapped mint for
/// `(unwrapped_mint, wrapped_token_program)`. Returns the wrapped mint's
/// address and its authority PDA.
pub fn create_wrapped_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    unwrapped_mint: Address,
    wrapped_token_program: Address,
) -> (Address, Address) {
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let (wrapped_backpointer, _bump) = wrapped_mint_backpointer_pda(wrapped_mint);

    let fund_mint_ix =
        system_instruction::transfer(&payer.pubkey(), &wrapped_mint, WRAPPED_MINT_FUNDING_LAMPORTS);
    let fund_backpointer_ix = system_instruction::transfer(
        &payer.pubkey(),
        &wrapped_backpointer,
        BACKPOINTER_FUNDING_LAMPORTS,
    );
    let create_mint_ix = build_create_mint_ix(unwrapped_mint, wrapped_token_program, true);

    send(
        svm,
        &[fund_mint_ix, fund_backpointer_ix, create_mint_ix],
        payer,
        &[],
    );

    let (wrapped_mint_authority, _bump) = wrapped_mint_authority_pda(wrapped_mint);
    (wrapped_mint, wrapped_mint_authority)
}
