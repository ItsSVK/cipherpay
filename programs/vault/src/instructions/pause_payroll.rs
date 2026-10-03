use anchor_lang::prelude::*;

use crate::{error::VaultError, events::PausePayrollEvent, Vault, VAULT_SEED};

/// UC3 (REQ11): Pauses payroll by setting `Vault.paused = true`. Only the vault's
/// authority can sign. Blocks `pay_employee` only: withdrawals stay open by design, so employees can always withdraw their own funds.
#[derive(Accounts)]
pub struct PausePayroll<'info> {
    #[account(address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
}

impl<'info> PausePayroll<'info> {
    fn pause_payroll(&mut self) {
        self.vault.paused = true;
    }
}

pub fn handle_pause_payroll(ctx: Context<PausePayroll>) -> Result<()> {
    ctx.accounts.pause_payroll();

    emit!(PausePayrollEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
    });

    Ok(())
}
