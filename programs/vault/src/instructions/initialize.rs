use anchor_lang::prelude::*;
use anchor_spl::token_2022::ID as TOKEN_2022_PROGRAM_ID;
use anchor_spl::token_interface::Mint;
use confidential_token_helpers::assert_confidential_transfer_enabled;

use crate::{constants::*, events::InitializeEvent, state::Vault};

#[derive(Accounts)]
pub struct Initialize<'info> {
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

impl<'info> Initialize<'info> {
    fn initialize(&mut self, bumps: InitializeBumps) -> Result<()> {
        self.vault.set_inner(Vault {
            authority: self.admin.key(),
            mint: self.mint.key(),
            auditor_elgamal_pubkey: None,
            bump: bumps.vault,
            paused: false,
            treasury_token_account: Pubkey::default(),
            treasury_elgamal_pubkey: Pubkey::default(),
            treasury_configured: false,
        });
        Ok(())
    }
}

pub fn handle_initialize(ctx: Context<Initialize>) -> Result<()> {
    assert_confidential_transfer_enabled(&ctx.accounts.mint.to_account_info())?;

    ctx.accounts.initialize(ctx.bumps)?;

    emit!(InitializeEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        mint: ctx.accounts.mint.key(),
    });

    Ok(())
}
