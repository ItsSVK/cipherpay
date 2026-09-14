use std::num::NonZeroI8;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{Mint, TokenInterface},
};
use bytemuck::Zeroable;
use solana_instructions_sysvar as sysvar_instructions;
use solana_zk_elgamal_proof_interface::proof_data::PubkeyValidityProofData;
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::{
    extension::{
        confidential_transfer::instruction::inner_configure_account,
        confidential_transfer::DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER, ExtensionType,
    },
    instruction::reallocate,
};
use spl_token_confidential_transfer_proof_extraction::instruction::ProofLocation;

use crate::{
    assert_pubkey_validity_proof, error::VaultError, events::ConfigureTreasuryAccountEvent, Vault,
    VAULT_SEED,
};

#[derive(Accounts)]
pub struct ConfigureTreasuryAccount<'info> {
    #[account(mut, address = vault.authority @ VaultError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()],
        bump = vault.bump,
        constraint = !vault.treasury_configured @ VaultError::TreasuryAlreadyConfigured,
    )]
    pub vault: Account<'info, Vault>,

    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: not yet initialized -- created manually inside the handler,
    /// same reason as `create_user_account`'s `user_token_account`. Owned by
    /// the vault PDA (not the admin) so `pay_employee`/`batch_pay` can move
    /// funds out of it via `invoke_signed` without a human co-signing every
    /// payment.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &vault.key(),
            &mint.key(),
            &token_program.key(),
        )
    )]
    pub treasury_token_account: UncheckedAccount<'info>,

    /// CHECK: read manually to confirm a VerifyPubkeyValidity proof for
    /// `elgamal_pubkey` precedes this instruction in the same transaction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> ConfigureTreasuryAccount<'info> {
    fn vault_signer_seeds(&self) -> [Vec<u8>; 4] {
        [
            VAULT_SEED.to_vec(),
            self.vault.authority.to_bytes().to_vec(),
            self.vault.mint.to_bytes().to_vec(),
            vec![self.vault.bump],
        ]
    }

    fn record_treasury_account(&mut self, elgamal_pubkey: [u8; 32]) -> Result<()> {
        self.vault.treasury_token_account = self.treasury_token_account.key();
        self.vault.treasury_elgamal_pubkey = Pubkey::new_from_array(elgamal_pubkey);
        self.vault.treasury_configured = true;

        Ok(())
    }

    /// Creates the associated token account for `mint`, owned by the vault
    /// PDA. Only allocates space for the base account plus whatever
    /// extensions the associated token program deems required by the mint --
    /// `ConfidentialTransferAccount` is added separately below.
    fn create_token_account(&self) -> Result<()> {
        associated_token::create_idempotent(CpiContext::new(
            self.associated_token_program.key(),
            associated_token::Create {
                payer: self.admin.to_account_info(),
                associated_token: self.treasury_token_account.to_account_info(),
                authority: self.vault.to_account_info(),
                mint: self.mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            },
        ))
    }

    /// Grows the token account to make room for the `ConfidentialTransferAccount`
    /// extension. `admin` funds the resize; the vault PDA -- the token
    /// account's actual owner -- authorizes it via `invoke_signed`.
    fn reallocate_for_confidential_transfer(&self) -> Result<()> {
        let vault_key = self.vault.key();

        let ix = reallocate(
            &self.token_program.key(),
            &self.treasury_token_account.key(),
            &self.admin.key(),
            &vault_key,
            &[],
            &[ExtensionType::ConfidentialTransferAccount],
        )?;

        let seeds = self.vault_signer_seeds();
        let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();

        invoke_signed(
            &ix,
            &[
                self.treasury_token_account.to_account_info(),
                self.admin.to_account_info(),
                self.system_program.to_account_info(),
                self.vault.to_account_info(),
            ],
            &[&seed_refs],
        )?;

        Ok(())
    }

    /// Initializes the `ConfidentialTransferAccount` extension with the
    /// admin's ElGamal pubkey (per the design decision that the vault
    /// authority, not a separate operator key, holds decryption authority
    /// over the treasury). The vault PDA -- the account's owner -- signs via
    /// `invoke_signed`; Token-2022 independently re-verifies that the
    /// preceding instruction is the matching `VerifyPubkeyValidity` proof.
    fn configure_confidential_transfer_account(
        &self,
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        let vault_key = self.vault.key();

        // Ignored by `inner_configure_account` when the proof is located via
        // instruction offset rather than embedded in this instruction's data.
        let unused_proof_data = PubkeyValidityProofData::zeroed();

        let ix = inner_configure_account(
            &self.token_program.key(),
            &self.treasury_token_account.key(),
            &self.mint.key(),
            &PodAeCiphertext(decryptable_zero_balance),
            DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER,
            &vault_key,
            &[],
            ProofLocation::InstructionOffset(NonZeroI8::new(-1).unwrap(), &unused_proof_data),
        )?;

        let seeds = self.vault_signer_seeds();
        let seed_refs: Vec<&[u8]> = seeds.iter().map(Vec::as_slice).collect();

        invoke_signed(
            &ix,
            &[
                self.treasury_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.instructions_sysvar.to_account_info(),
                self.vault.to_account_info(),
            ],
            &[&seed_refs],
        )?;

        Ok(())
    }
}

pub fn handle_configure_treasury_account(
    ctx: Context<ConfigureTreasuryAccount>,
    elgamal_pubkey: [u8; 32],
    decryptable_zero_balance: [u8; 36],
) -> Result<()> {
    assert_pubkey_validity_proof(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &elgamal_pubkey,
    )?;

    ctx.accounts.create_token_account()?;
    ctx.accounts.reallocate_for_confidential_transfer()?;
    ctx.accounts
        .configure_confidential_transfer_account(decryptable_zero_balance)?;

    ctx.accounts.record_treasury_account(elgamal_pubkey)?;

    emit!(ConfigureTreasuryAccountEvent {
        vault: ctx.accounts.vault.key(),
        treasury_token_account: ctx.accounts.treasury_token_account.key(),
    });

    Ok(())
}
