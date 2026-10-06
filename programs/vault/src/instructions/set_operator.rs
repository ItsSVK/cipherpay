use anchor_lang::prelude::*;

use crate::{
    error::VaultError, events::SetOperatorEvent, OperatorConfig, Vault, OPERATOR_SEED, VAULT_SEED,
};

/// Authorizes (or revokes) the vault's payroll operator: one key that may call `pay_employee` for this vault, and nothing else.
/// Admin only. Calling it again replaces the previous operator.
///
/// Why this exists: `pay_employee` needs a wallet signature, and a wallet that is slow to show its approval can miss a
/// transaction's ~40 second validity window. With an operator the admin approves once, here, and a payroll run (a key held by
/// the admin's own client) pays everyone without a prompt per payment.
///
/// - `operator` = `Pubkey::default()` revokes. Anything else authorizes that key.
/// - `expires_at` is a unix timestamp after which the operator can't pay. 0 means it never expires. For a real operator it must be
///   0 or in the future; revoking always stores 0.
///
/// The operator lives in its own PDA (`[OPERATOR_SEED, vault]`), created on first use, so `Vault` itself is untouched.
#[derive(Accounts)]
pub struct SetOperator<'info> {
    #[account(mut, address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + OperatorConfig::INIT_SPACE,
        seeds = [OPERATOR_SEED, vault.key().as_ref()],
        bump,
    )]
    pub operator_config: Account<'info, OperatorConfig>,

    pub system_program: Program<'info, System>,
}

impl<'info> SetOperator<'info> {
    fn set_operator(&mut self, operator: Pubkey, expires_at: i64, bump: u8) -> Result<()> {
        let revoking = operator == Pubkey::default();
        if !revoking && expires_at != 0 {
            require!(
                expires_at > Clock::get()?.unix_timestamp,
                VaultError::InvalidOperatorExpiry
            );
        }

        self.operator_config.set_inner(OperatorConfig {
            vault: self.vault.key(),
            operator,
            expires_at: if revoking { 0 } else { expires_at },
            bump,
        });
        Ok(())
    }
}

pub fn handle_set_operator(ctx: Context<SetOperator>, operator: Pubkey, expires_at: i64) -> Result<()> {
    let bump = ctx.bumps.operator_config;
    ctx.accounts.set_operator(operator, expires_at, bump)?;

    emit!(SetOperatorEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
        operator: ctx.accounts.operator_config.operator,
        expires_at: ctx.accounts.operator_config.expires_at,
    });

    Ok(())
}
