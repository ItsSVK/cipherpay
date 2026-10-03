use anchor_lang::prelude::*;

use crate::{error::VaultError, events::ResumePayrollEvent, Vault, VAULT_SEED};

/// REQ12: Resumes payroll by setting `Vault.paused = false`. Only the vault's
/// authority can sign.
#[derive(Accounts)]
pub struct ResumePayroll<'info> {
    #[account(address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
}

impl<'info> ResumePayroll<'info> {
    fn resume_payroll(&mut self) {
        self.vault.paused = false;
    }
}

pub fn handle_resume_payroll(ctx: Context<ResumePayroll>) -> Result<()> {
    ctx.accounts.resume_payroll();

    emit!(ResumePayrollEvent {
        vault: ctx.accounts.vault.key(),
        admin: ctx.accounts.admin.key(),
    });

    Ok(())
}
