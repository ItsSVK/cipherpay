use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{Mint, TokenInterface},
};
use confidential_token_helpers::{assert_pubkey_validity_proof, Authority, ConfidentialAccountSetup};
use solana_instructions_sysvar as sysvar_instructions;

use crate::{UserAccount, Vault, USER_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct CreateUserAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = user,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [USER_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: not yet initialized -- created manually inside the handler
    /// because Anchor's `init` sugar for token accounts can't allocate
    /// Token-2022 extension space (see `ConfidentialAccountSetup`).
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &user.key(),
            &mint.key(),
            &token_program.key(),
        )
    )]
    pub user_token_account: UncheckedAccount<'info>,

    /// CHECK: read manually to confirm a VerifyPubkeyValidity proof for
    /// `elgamal_pubkey` precedes this instruction in the same transaction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateUserAccount<'info> {
    /// The user's own wallet owns their token account directly (unlike the
    /// treasury, which is vault-PDA-owned) -- so this is a plain `Signer`
    /// authority, and CPIs here use `invoke`, not `invoke_signed`.
    fn account_setup(&self) -> ConfidentialAccountSetup<'_, 'info> {
        ConfidentialAccountSetup {
            payer: self.user.as_ref(),
            token_account: self.user_token_account.as_ref(),
            mint: self.mint.as_ref(),
            authority: Authority::Signer(self.user.as_ref()),
            instructions_sysvar: self.instructions_sysvar.as_ref(),
            associated_token_program: self.associated_token_program.as_ref(),
            token_program: self.token_program.as_ref(),
            system_program: self.system_program.as_ref(),
        }
    }

    fn initialize_user_account(&mut self, bump: u8, elgamal_pubkey: [u8; 32]) -> Result<()> {
        self.user_account.set_inner(UserAccount {
            vault: self.vault.key(),
            owner: self.user.key(),
            token_account: self.user_token_account.key(),
            elgamal_pubkey: Pubkey::new_from_array(elgamal_pubkey),
            bump,
            active: true,
        });

        Ok(())
    }
}

pub fn handle_create_user_account(
    ctx: Context<CreateUserAccount>,
    elgamal_pubkey: [u8; 32],
    decryptable_zero_balance: [u8; 36],
) -> Result<()> {
    assert_pubkey_validity_proof(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &elgamal_pubkey,
    )?;

    ctx.accounts
        .account_setup()
        .run(decryptable_zero_balance)?;

    ctx.accounts
        .initialize_user_account(ctx.bumps.user_account, elgamal_pubkey)?;

    Ok(())
}
