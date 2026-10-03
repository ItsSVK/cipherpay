use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_zk_sdk_pod::encryption::{auth_encryption::PodAeCiphertext, elgamal::PodElGamalCiphertext};
use spl_token_2022_interface::extension::confidential_transfer::instruction::inner_transfer;
use spl_token_confidential_transfer_proof_extraction::instruction::ProofLocation;

use crate::{error::VaultError, events::PayEmployeeEvent, Vault, VAULT_SEED};

/// UC1 (REQ01 to REQ07): pays one employee from the encrypted treasury. The
/// amount is never revealed on-chain; only the auditor can read it.
///
/// Account order matters: Anchor validates accounts in declaration order, so
/// `admin` (signer must equal `Vault.authority`, REQ03) is checked before
/// `vault` (`paused` must be false, REQ02).
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
/// actually proven.
#[derive(Accounts)]
pub struct PayEmployee<'info> {
    #[account(address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
        constraint = !vault.paused @ VaultError::PayrollPaused,
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
}

impl<'info> PayEmployee<'info> {
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
    ctx.accounts.pay_employee(
        new_source_decryptable_available_balance,
        transfer_amount_auditor_ciphertext_lo,
        transfer_amount_auditor_ciphertext_hi,
    )?;

    emit!(PayEmployeeEvent {
        vault: ctx.accounts.vault.key(),
        employee: ctx.accounts.employee_token_account.owner,
        employee_token_account: ctx.accounts.employee_token_account.key(),
        auditor_ciphertext_lo: transfer_amount_auditor_ciphertext_lo,
        auditor_ciphertext_hi: transfer_amount_auditor_ciphertext_hi,
    });

    Ok(())
}
