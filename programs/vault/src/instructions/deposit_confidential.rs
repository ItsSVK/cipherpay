use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use spl_token_2022_interface::extension::confidential_transfer::instruction::deposit;

use crate::{error::VaultError, events::DepositConfidentialEvent, Vault, VAULT_SEED};

/// Moves `amount` from the treasury's public balance into its pending
/// confidential balance. No proof is required -- depositing a known public
/// amount into a fresh Pedersen commitment doesn't need one, unlike
/// registering or spending from an encrypted balance.
#[derive(Accounts)]
pub struct DepositConfidential<'info> {
    #[account(address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
        constraint = vault.treasury_configured @ VaultError::TreasuryNotConfigured,
    )]
    pub vault: Account<'info, Vault>,

    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = vault.treasury_token_account)]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> DepositConfidential<'info> {
    /// `Deposit`'s `authority` account must match the treasury token
    /// account's Token-2022 owner -- the vault PDA, not `admin` -- so this
    /// CPI needs `invoke_signed` with the vault's own seeds.
    fn deposit(&self, amount: u64) -> Result<()> {
        let vault_key = self.vault.key();

        let ix = deposit(
            &self.token_program.key(),
            &self.treasury_token_account.key(),
            &self.mint.key(),
            amount,
            self.mint.decimals,
            &vault_key,
            &[],
        )?;

        let seeds = self.vault.signer_seeds();
        let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();

        invoke_signed(
            &ix,
            &[
                self.treasury_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.vault.to_account_info(),
            ],
            &[&seed_refs],
        )?;

        Ok(())
    }
}

pub fn handle_deposit_confidential(ctx: Context<DepositConfidential>, amount: u64) -> Result<()> {
    ctx.accounts.deposit(amount)?;

    emit!(DepositConfidentialEvent {
        vault: ctx.accounts.vault.key(),
        amount,
    });

    Ok(())
}
