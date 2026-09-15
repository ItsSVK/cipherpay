use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::extension::confidential_transfer::instruction::apply_pending_balance;

use crate::{error::VaultError, events::ApplyTreasuryPendingEvent, Vault, VAULT_SEED};

/// Folds the treasury's pending confidential balance into its available
/// balance, resetting the pending-credit counter. `admin` must supply the
/// two values only they can compute, since they hold the treasury's ElGamal
/// decryption key: the pending-credit counter they expect to see (so
/// Token-2022 can catch a race against a concurrent incoming credit), and
/// the new AES-encrypted available balance reflecting the merge.
#[derive(Accounts)]
pub struct ApplyTreasuryPending<'info> {
    #[account(address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
        constraint = vault.treasury_configured @ VaultError::TreasuryNotConfigured,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, address = vault.treasury_token_account)]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> ApplyTreasuryPending<'info> {
    /// `ApplyPendingBalance`'s `authority` account must match the treasury
    /// token account's Token-2022 owner -- the vault PDA -- so this CPI
    /// needs `invoke_signed` with the vault's own seeds, same as
    /// `configure_treasury_account`/`deposit_confidential`.
    fn apply_pending_balance(
        &self,
        expected_pending_balance_credit_counter: u64,
        new_decryptable_available_balance: [u8; 36],
    ) -> Result<()> {
        let vault_key = self.vault.key();

        let ix = apply_pending_balance(
            &self.token_program.key(),
            &self.treasury_token_account.key(),
            expected_pending_balance_credit_counter,
            &PodAeCiphertext(new_decryptable_available_balance),
            &vault_key,
            &[],
        )?;

        let seeds = self.vault.signer_seeds();
        let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();

        invoke_signed(
            &ix,
            &[
                self.treasury_token_account.to_account_info(),
                self.vault.to_account_info(),
            ],
            &[&seed_refs],
        )?;

        Ok(())
    }
}

pub fn handle_apply_treasury_pending(
    ctx: Context<ApplyTreasuryPending>,
    expected_pending_balance_credit_counter: u64,
    new_decryptable_available_balance: [u8; 36],
) -> Result<()> {
    ctx.accounts.apply_pending_balance(
        expected_pending_balance_credit_counter,
        new_decryptable_available_balance,
    )?;

    emit!(ApplyTreasuryPendingEvent {
        vault: ctx.accounts.vault.key(),
    });

    Ok(())
}
