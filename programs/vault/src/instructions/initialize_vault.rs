use anchor_lang::prelude::*;
use anchor_spl::token_2022::ID as TOKEN_2022_PROGRAM_ID;
use anchor_spl::token_interface::Mint;
use confidential_token_helpers::assert_confidential_transfer_enabled;

use crate::{constants::*, events::InitializeVaultEvent, state::Vault};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, admin.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        constraint = mint.to_account_info().owner == &TOKEN_2022_PROGRAM_ID
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeVault<'info> {
    fn initialize_vault(&mut self, bumps: InitializeVaultBumps) -> Result<()> {
        self.vault.set_inner(Vault {
            authority: self.admin.key(),
            mint: self.mint.key(),
            bump: bumps.vault,
            paused: false,
            treasury_token_account: Pubkey::default(),
            treasury_elgamal_pubkey: Pubkey::default(),
            treasury_configured: false,
        });
        Ok(())
    }
}

pub fn handle_initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
    assert_confidential_transfer_enabled(&ctx.accounts.mint.to_account_info())?;

    ctx.accounts.initialize_vault(ctx.bumps)?;

    emit!(InitializeVaultEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        mint: ctx.accounts.mint.key(),
    });

    Ok(())
}
