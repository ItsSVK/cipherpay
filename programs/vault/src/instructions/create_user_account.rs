use std::num::NonZeroI8;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
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

use crate::{assert_pubkey_validity_proof, UserAccount, Vault, USER_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct CreateUserAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.authority.key().as_ref(), vault.mint.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = user,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [USER_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: not yet initialized -- created manually inside the handler
    /// because Anchor's `init` sugar for token accounts can't allocate
    /// Token-2022 extension space.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &user.key(),
            &mint.key(),
            &token_program.key(),
        )
    )]
    pub user_token_account: UncheckedAccount<'info>,

    /// CHECK: read manually to confirm a VerifyPubkeyValidity proof for
    /// `elgamal_pubkey` precedes this instruction in the same transaction.
    #[account(address = sysvar_instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateUserAccount<'info> {
    fn initialize_user_account(&mut self, bump: u8, elgamal_pubkey: [u8; 32]) -> Result<()> {
        self.user_account.set_inner(UserAccount {
            vault: self.vault.key(),
            owner: self.user.key(),
            token_account: self.user_token_account.key(),
            elgamal_pubkey: Pubkey::new_from_array(elgamal_pubkey),
            bump,
            active: true,
        });

        Ok(())
    }

    /// Creates the associated token account for `mint`, owned by `user`.
    /// Only allocates space for the base account plus whatever extensions
    /// the associated token program deems required by the mint (e.g.
    /// `ImmutableOwner`) -- `ConfidentialTransferAccount` is added separately
    /// since it isn't auto-required and needs the owner's ElGamal pubkey.
    fn create_token_account(&self) -> Result<()> {
        associated_token::create_idempotent(CpiContext::new(
            self.associated_token_program.key(),
            associated_token::Create {
                payer: self.user.to_account_info(),
                associated_token: self.user_token_account.to_account_info(),
                authority: self.user.to_account_info(),
                mint: self.mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            },
        ))
    }

    /// Grows the token account to make room for the `ConfidentialTransferAccount`
    /// extension. `user` funds and authorizes the resize.
    fn reallocate_for_confidential_transfer(&self) -> Result<()> {
        let ix = reallocate(
            &self.token_program.key(),
            &self.user_token_account.key(),
            &self.user.key(),
            &self.user.key(),
            &[],
            &[ExtensionType::ConfidentialTransferAccount],
        )?;

        invoke(
            &ix,
            &[
                self.user_token_account.to_account_info(),
                self.user.to_account_info(),
                self.system_program.to_account_info(),
                self.user.to_account_info(),
            ],
        )?;

        Ok(())
    }

    /// Initializes the `ConfidentialTransferAccount` extension with the
    /// owner's ElGamal pubkey. Token-2022 independently re-verifies that the
    /// preceding instruction is the matching `VerifyPubkeyValidity` proof.
    fn configure_confidential_transfer_account(
        &self,
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        // Ignored by `inner_configure_account` when the proof is located via
        // instruction offset rather than embedded in this instruction's data.
        let unused_proof_data = PubkeyValidityProofData::zeroed();

        let ix = inner_configure_account(
            &self.token_program.key(),
            &self.user_token_account.key(),
            &self.mint.key(),
            &PodAeCiphertext(decryptable_zero_balance),
            DEFAULT_MAXIMUM_PENDING_BALANCE_CREDIT_COUNTER,
            &self.user.key(),
            &[],
            ProofLocation::InstructionOffset(NonZeroI8::new(-1).unwrap(), &unused_proof_data),
        )?;

        invoke(
            &ix,
            &[
                self.user_token_account.to_account_info(),
                self.mint.to_account_info(),
                self.instructions_sysvar.to_account_info(),
                self.user.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

pub fn handle_create_user_account(
    ctx: Context<CreateUserAccount>,
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

    ctx.accounts
        .initialize_user_account(ctx.bumps.user_account, elgamal_pubkey)?;

    Ok(())
}
