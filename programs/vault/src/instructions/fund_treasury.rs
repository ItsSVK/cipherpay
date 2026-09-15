use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

use crate::{error::VaultError, events::FundTreasuryEvent, Vault, VAULT_SEED};

/// Moves tokens from a funder's ordinary (public) token account into the
/// treasury's public balance. Plain SPL transfer -- no confidential-transfer
/// instructions involved, since the funds only become *confidential* once
/// `deposit_confidential` moves them into the pending encrypted balance.
#[derive(Accounts)]
pub struct FundTreasury<'info> {
    pub funder: Signer<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = funder
    )]
    pub funder_token_account: InterfaceAccount<'info, TokenAccount>,

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

impl<'info> FundTreasury<'info> {
    fn transfer_into_treasury(&self, amount: u64) -> Result<()> {
        token_interface::transfer_checked(
            CpiContext::new(
                self.token_program.key(),
                token_interface::TransferChecked {
                    from: self.funder_token_account.to_account_info(),
                    mint: self.mint.to_account_info(),
                    to: self.treasury_token_account.to_account_info(),
                    authority: self.funder.to_account_info(),
                },
            ),
            amount,
            self.mint.decimals,
        )
    }
}

pub fn handle_fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    ctx.accounts.transfer_into_treasury(amount)?;

    emit!(FundTreasuryEvent {
        vault: ctx.accounts.vault.key(),
        funder: ctx.accounts.funder.key(),
        amount,
    });

    Ok(())
}
