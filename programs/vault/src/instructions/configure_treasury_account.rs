use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{Mint, TokenInterface},
};
use confidential_token_helpers::{assert_pubkey_validity_proof, Authority, ConfidentialAccountSetup};
use solana_instructions_sysvar as sysvar_instructions;

use crate::{error::VaultError, events::ConfigureTreasuryAccountEvent, Vault, VAULT_SEED};

#[derive(Accounts)]
pub struct ConfigureTreasuryAccount<'info> {
    #[account(mut, address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
        constraint = !vault.treasury_configured @ VaultError::TreasuryAlreadyConfigured,
    )]
    pub vault: Account<'info, Vault>,

    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: not yet initialized -- created manually inside the handler,
    /// same reason as `create_user_account`'s `user_token_account`. Owned by
    /// the vault PDA (not the admin) so `pay_employee`/`batch_pay` can move
    /// funds out of it via `invoke_signed` without a human co-signing every
    /// payment.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &vault.key(),
            &mint.key(),
            &token_program.key(),
        )
    )]
    pub treasury_token_account: UncheckedAccount<'info>,

    /// CHECK: read manually to confirm a VerifyPubkeyValidity proof for
    /// `elgamal_pubkey` precedes this instruction in the same transaction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> ConfigureTreasuryAccount<'info> {
    /// The treasury's owner is the *vault PDA*, not the admin wallet -- so
    /// this is a `Pda` authority, and CPIs here use `invoke_signed` with the
    /// vault's own seeds, unlike `create_user_account`'s plain `invoke`.
    fn account_setup(&self) -> ConfidentialAccountSetup<'_, 'info> {
        ConfidentialAccountSetup {
            payer: self.admin.as_ref(),
            token_account: self.treasury_token_account.as_ref(),
            mint: self.mint.as_ref(),
            authority: Authority::Pda {
                account: self.vault.as_ref(),
                seeds: self.vault.signer_seeds().to_vec(),
            },
            instructions_sysvar: self.instructions_sysvar.as_ref(),
            associated_token_program: self.associated_token_program.as_ref(),
            token_program: self.token_program.as_ref(),
            system_program: self.system_program.as_ref(),
        }
    }

    fn record_treasury_account(&mut self, elgamal_pubkey: [u8; 32]) -> Result<()> {
        self.vault.treasury_token_account = self.treasury_token_account.key();
        self.vault.treasury_elgamal_pubkey = Pubkey::new_from_array(elgamal_pubkey);
        self.vault.treasury_configured = true;

        Ok(())
    }
}

pub fn handle_configure_treasury_account(
    ctx: Context<ConfigureTreasuryAccount>,
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

    ctx.accounts.record_treasury_account(elgamal_pubkey)?;

    emit!(ConfigureTreasuryAccountEvent {
        vault: ctx.accounts.vault.key(),
        treasury_token_account: ctx.accounts.treasury_token_account.key(),
    });

    Ok(())
}
