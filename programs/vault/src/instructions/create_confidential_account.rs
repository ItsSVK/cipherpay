use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{Mint, TokenInterface},
};
use confidential_token_helpers::{
    assert_confidential_transfer_enabled, assert_pubkey_validity_proof, Authority,
    ConfidentialAccountSetup,
};
use solana_instructions_sysvar as sysvar_instructions;

use crate::events::CreateConfidentialAccountEvent;

/// The confidential P2P transfer primitive (`PRODUCT.md` §1/§11): sets up a
/// confidential Token-2022 account for `owner`'s own wallet on any
/// confidential-transfer-enabled mint -- no `Vault`, no `UserAccount`, no
/// treasury/employee relationship of any kind. Deliberately the
/// vault-agnostic sibling of `create_user_account` (which layers vault
/// membership bookkeeping on top of the same underlying CPI sequence for
/// the payroll product).
///
/// Unlike `create_user_account`/`configure_treasury_account`, there's no
/// separate bookkeeping account here at all: the Token-2022 account itself
/// (its `ConfidentialTransferAccount` extension already stores the
/// registered ElGamal pubkey) is the complete state. Nothing needs tracking
/// beyond what Token-2022 already tracks.
#[derive(Accounts)]
pub struct CreateConfidentialAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: not yet initialized -- created manually inside the handler
    /// because Anchor's `init` sugar for token accounts can't allocate
    /// Token-2022 extension space (see `ConfidentialAccountSetup`).
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &owner.key(),
            &mint.key(),
            &token_program.key(),
        )
    )]
    pub token_account: UncheckedAccount<'info>,

    /// CHECK: read manually to confirm a VerifyPubkeyValidity proof for
    /// `elgamal_pubkey` precedes this instruction in the same transaction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateConfidentialAccount<'info> {
    /// The owner's own wallet owns the token account directly -- a plain
    /// `Signer` authority, same as `create_user_account`'s pattern (not the
    /// treasury's PDA-authority one).
    fn account_setup(&self) -> ConfidentialAccountSetup<'_, 'info> {
        ConfidentialAccountSetup {
            payer: self.owner.as_ref(),
            token_account: self.token_account.as_ref(),
            mint: self.mint.as_ref(),
            authority: Authority::Signer(self.owner.as_ref()),
            instructions_sysvar: self.instructions_sysvar.as_ref(),
            associated_token_program: self.associated_token_program.as_ref(),
            token_program: self.token_program.as_ref(),
            system_program: self.system_program.as_ref(),
        }
    }
}

pub fn handle_create_confidential_account(
    ctx: Context<CreateConfidentialAccount>,
    elgamal_pubkey: [u8; 32],
    decryptable_zero_balance: [u8; 36],
) -> Result<()> {
    // Unlike the vault-scoped instructions, there's no prior `initialize_vault`
    // step that already validated this mint -- callers can name any
    // Token-2022 mint here, so it has to be checked fresh every time.
    assert_confidential_transfer_enabled(&ctx.accounts.mint.to_account_info())?;

    assert_pubkey_validity_proof(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &elgamal_pubkey,
    )?;

    ctx.accounts
        .account_setup()
        .run(decryptable_zero_balance)?;

    emit!(CreateConfidentialAccountEvent {
        owner: ctx.accounts.owner.key(),
        mint: ctx.accounts.mint.key(),
        token_account: ctx.accounts.token_account.key(),
    });

    Ok(())
}
