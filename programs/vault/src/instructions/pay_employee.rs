use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_zk_sdk_pod::encryption::{auth_encryption::PodAeCiphertext, elgamal::PodElGamalCiphertext};
use spl_token_2022_interface::extension::confidential_transfer::instruction::inner_transfer;
use spl_token_confidential_transfer_proof_extraction::instruction::ProofLocation;

use crate::{
    error::VaultError, events::PayEmployeeEvent, OperatorConfig, Vault, OPERATOR_SEED, VAULT_SEED,
};

/// UC1 (REQ01 to REQ07): pays one employee from the encrypted treasury. The
/// amount is never revealed on-chain; only the auditor can read it.
///
/// Who may sign (REQ03): the vault's `authority` (the admin), or the vault's
/// authorized operator (see `set_operator`), if one is set and has not
/// expired. Anyone else is rejected with `Unauthorized`, before the paused
/// check and before any proof is looked at. The operator can do this and
/// nothing else: pause, resume, funding and `set_operator` stay admin-only.
///
/// Check order is part of the contract (REQ03 before REQ02): who signed, then
/// whether payroll is paused. The authorization check lives in the handler
/// (not in an account constraint) because deciding whether the signer is the
/// operator needs the `operator_config` account too, and the expired case has
/// its own error.
///
/// The treasury's Token-2022 owner is the vault PDA, so the `Transfer` CPI
/// needs `invoke_signed` with the vault's seeds (REQ04); a wallet-owned
/// source account would use a plain `invoke` instead.
///
/// Proofs (equality, ciphertext-validity, range) are generated client-side
/// and referenced as three context-state accounts (REQ05); the proofs don't
/// fit in the same transaction as the transfer. Token-2022 cross-checks them,
/// including that the amount was encrypted to the mint's registered auditor
/// key (REQ06), when the CPI runs.
///
/// The event carries the two auditor ciphertexts (the amount's lo/hi halves,
/// encrypted to the auditor) and never the plaintext (REQ07). They come from
/// the instruction arguments, which Token-2022 requires to match the
/// ciphertext-validity proof context, so they cannot differ from what was
/// actually proven. It also records who signed, so an auditor can tell an
/// admin payment from an operator payment.
#[derive(Accounts)]
pub struct PayEmployee<'info> {
    /// The vault's admin, or its authorized operator. Checked in the handler.
    pub signer: Signer<'info>,

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

    #[account(mut, token::mint = mint)]
    pub employee_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: pre-verified `VerifyCiphertextCommitmentEquality` context-state
    /// account -- Token-2022 checks its ownership (must belong to the ZK
    /// ElGamal Proof program) and contents when the CPI below runs.
    pub equality_proof_context: UncheckedAccount<'info>,

    /// CHECK: pre-verified `VerifyBatchedGroupedCiphertext3HandlesValidity`
    /// context-state account. See `equality_proof_context`.
    pub ciphertext_validity_proof_context: UncheckedAccount<'info>,

    /// CHECK: pre-verified `VerifyBatchedRangeProofU128` context-state
    /// account. See `equality_proof_context`.
    pub range_proof_context: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: this vault's `OperatorConfig` PDA. Always passed (clients can derive
    /// its address), but only read (and, for an operator payment, written: it
    /// counts the payment) when the signer is not the admin: it may not
    /// exist (no operator was ever set), and an admin-signed payment never needs
    /// it. Its address is pinned by the seeds constraint, and the owner and
    /// discriminator are checked before the data is trusted.
    #[account(mut, seeds = [OPERATOR_SEED, vault.key().as_ref()], bump)]
    pub operator_config: UncheckedAccount<'info>,
}

impl<'info> PayEmployee<'info> {
    /// REQ03: the admin always may sign. Anyone else must be this vault's current,
    /// unexpired operator with payments left (each operator payment uses one).
    fn authorize_signer(&self) -> Result<()> {
        let signer = self.signer.key();
        if signer == self.vault.authority {
            return Ok(());
        }

        let info = self.operator_config.to_account_info();
        // No operator was ever set: the account is an empty system account.
        require!(
            info.owner == &crate::ID && !info.data_is_empty(),
            VaultError::Unauthorized
        );
        let mut config = OperatorConfig::try_deserialize(&mut &info.try_borrow_data()?[..])?;

        require_keys_eq!(config.vault, self.vault.key(), VaultError::Unauthorized);
        require!(
            config.operator != Pubkey::default() && config.operator == signer,
            VaultError::Unauthorized
        );
        require!(
            config.expires_at == 0 || Clock::get()?.unix_timestamp <= config.expires_at,
            VaultError::OperatorExpired
        );
        require!(config.payments_left > 0, VaultError::OperatorLimitReached);

        // Spend one payment. The write is undone with the rest of the transaction if the transfer below fails.
        config.payments_left -= 1;
        config.try_serialize(&mut &mut info.try_borrow_mut_data()?[..])?;
        Ok(())
    }

    fn pay_employee(
        &self,
        new_source_decryptable_available_balance: [u8; 36],
        transfer_amount_auditor_ciphertext_lo: [u8; 64],
        transfer_amount_auditor_ciphertext_hi: [u8; 64],
    ) -> Result<()> {
        let vault_key = self.vault.key();

        let ix = inner_transfer(
            &self.token_program.key(),
            &self.treasury_token_account.key(),
            &self.mint.key(),
            &self.employee_token_account.key(),
            &PodAeCiphertext(new_source_decryptable_available_balance),
            &PodElGamalCiphertext(transfer_amount_auditor_ciphertext_lo),
            &PodElGamalCiphertext(transfer_amount_auditor_ciphertext_hi),
            &vault_key,
            &[],
            ProofLocation::ContextStateAccount(&self.equality_proof_context.key()),
            ProofLocation::ContextStateAccount(&self.ciphertext_validity_proof_context.key()),
            ProofLocation::ContextStateAccount(&self.range_proof_context.key()),
        )?;

        let seeds = self.vault.signer_seeds();
        let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();

        invoke_signed(
            &ix,
            &[
                self.treasury_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.employee_token_account.to_account_info(),
                self.equality_proof_context.to_account_info(),
                self.ciphertext_validity_proof_context.to_account_info(),
                self.range_proof_context.to_account_info(),
                self.vault.to_account_info(),
            ],
            &[&seed_refs],
        )?;

        Ok(())
    }
}

pub fn handle_pay_employee(
    ctx: Context<PayEmployee>,
    new_source_decryptable_available_balance: [u8; 36],
    transfer_amount_auditor_ciphertext_lo: [u8; 64],
    transfer_amount_auditor_ciphertext_hi: [u8; 64],
) -> Result<()> {
    // REQ03 first, then REQ02.
    ctx.accounts.authorize_signer()?;
    require!(!ctx.accounts.vault.paused, VaultError::PayrollPaused);

    ctx.accounts.pay_employee(
        new_source_decryptable_available_balance,
        transfer_amount_auditor_ciphertext_lo,
        transfer_amount_auditor_ciphertext_hi,
    )?;

    emit!(PayEmployeeEvent {
        vault: ctx.accounts.vault.key(),
        signer: ctx.accounts.signer.key(),
        employee: ctx.accounts.employee_token_account.owner,
        employee_token_account: ctx.accounts.employee_token_account.key(),
        auditor_ciphertext_lo: transfer_amount_auditor_ciphertext_lo,
        auditor_ciphertext_hi: transfer_amount_auditor_ciphertext_hi,
    });

    Ok(())
}
