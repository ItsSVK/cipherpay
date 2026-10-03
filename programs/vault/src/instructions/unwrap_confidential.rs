use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    events::UnwrapConfidentialEvent, TOKEN_WRAP_COMPLIANCE_PROGRAM_ID, WRAPPED_MINT_AUTHORITY_SEED,
    WRAPPED_MINT_SEED,
};

/// Reverses `wrap_confidential`: burns `amount` of the caller's wrapped
/// Token-2022 balance and releases the same amount of the real underlying
/// asset (e.g. USDC) from escrow back to the caller.
///
/// Only moves value out of the wrapped mint's *public* balance. Unwrapping
/// out of a *confidential* balance needs a `Withdraw` first (equality +
/// range proof) -- that's `withdraw_confidential`; this instruction assumes the caller already has a
/// public wrapped balance to unwrap (e.g. straight from `wrap_confidential`,
/// or a public wrapped-token transfer they received directly).
///
/// No `Vault` involved, same as `wrap_confidential`.
#[derive(Accounts)]
pub struct UnwrapConfidential<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The real asset's mint (e.g. USDC).
    pub unwrapped_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: the caller's own token account for the real asset, credited
    /// by `amount`. Created idempotently below if this is the caller's
    /// first time holding this mint.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &owner.key(),
            &unwrapped_mint.key(),
            &unwrapped_token_program.key(),
        ),
    )]
    pub owner_unwrapped_token_account: UncheckedAccount<'info>,

    /// CHECK: PDA owned by `token_wrap_compliance`
    /// (seeds `["mint", unwrapped_mint, wrapped_token_program]`); its supply
    /// is mutated (burned) by the CPI below.
    #[account(
        mut,
        seeds = [
            WRAPPED_MINT_SEED,
            unwrapped_mint.key().as_ref(),
            wrapped_token_program.key().as_ref(),
        ],
        bump,
        seeds::program = token_wrap_program.key(),
    )]
    pub wrapped_mint: UncheckedAccount<'info>,

    /// CHECK: PDA owned by `token_wrap_compliance`
    /// (seeds `["authority", wrapped_mint]`) -- owner of `escrow`. Never a
    /// signer here; the program signs for it internally.
    #[account(
        seeds = [WRAPPED_MINT_AUTHORITY_SEED, wrapped_mint.key().as_ref()],
        bump,
        seeds::program = token_wrap_program.key(),
    )]
    pub wrapped_mint_authority: UncheckedAccount<'info>,

    /// CHECK: custodies the real-asset backing being released back to the
    /// caller.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &wrapped_mint_authority.key(),
            &unwrapped_mint.key(),
            &unwrapped_token_program.key(),
        ),
    )]
    pub escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = wrapped_mint,
        token::authority = owner,
    )]
    pub owner_wrapped_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: our `token_wrap_compliance` fork.
    #[account(address = TOKEN_WRAP_COMPLIANCE_PROGRAM_ID)]
    pub token_wrap_program: UncheckedAccount<'info>,

    pub unwrapped_token_program: Interface<'info, TokenInterface>,
    pub wrapped_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> UnwrapConfidential<'info> {
    fn create_missing_token_account(&self) -> Result<()> {
        associated_token::create_idempotent(CpiContext::new(
            self.associated_token_program.key(),
            associated_token::Create {
                payer: self.owner.to_account_info(),
                associated_token: self.owner_unwrapped_token_account.to_account_info(),
                authority: self.owner.to_account_info(),
                mint: self.unwrapped_mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.unwrapped_token_program.to_account_info(),
            },
        ))
    }

    /// Hand-built CPI -- see the matching note on `WrapConfidential::wrap`.
    /// Account order and instruction encoding must match
    /// `native_programs/token_wrap_compliance/src/instruction.rs`'s
    /// `Unwrap` variant exactly.
    fn unwrap(&self, amount: u64) -> Result<()> {
        let mut data = vec![2u8];
        data.extend_from_slice(&amount.to_le_bytes());

        let ix = Instruction {
            program_id: self.token_wrap_program.key(),
            accounts: vec![
                AccountMeta::new(self.escrow.key(), false),
                AccountMeta::new(self.owner_unwrapped_token_account.key(), false),
                AccountMeta::new_readonly(self.wrapped_mint_authority.key(), false),
                AccountMeta::new_readonly(self.unwrapped_mint.key(), false),
                AccountMeta::new_readonly(self.wrapped_token_program.key(), false),
                AccountMeta::new_readonly(self.unwrapped_token_program.key(), false),
                AccountMeta::new(self.owner_wrapped_token_account.key(), false),
                AccountMeta::new(self.wrapped_mint.key(), false),
                AccountMeta::new_readonly(self.owner.key(), true),
            ],
            data,
        };

        invoke(
            &ix,
            &[
                self.escrow.to_account_info(),
                self.owner_unwrapped_token_account.to_account_info(),
                self.wrapped_mint_authority.to_account_info(),
                self.unwrapped_mint.to_account_info(),
                self.wrapped_token_program.to_account_info(),
                self.unwrapped_token_program.to_account_info(),
                self.owner_wrapped_token_account.to_account_info(),
                self.wrapped_mint.to_account_info(),
                self.owner.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

pub fn handle_unwrap_confidential(ctx: Context<UnwrapConfidential>, amount: u64) -> Result<()> {
    ctx.accounts.create_missing_token_account()?;
    ctx.accounts.unwrap(amount)?;

    emit!(UnwrapConfidentialEvent {
        owner: ctx.accounts.owner.key(),
        unwrapped_mint: ctx.accounts.unwrapped_mint.key(),
        wrapped_mint: ctx.accounts.wrapped_mint.key(),
        amount,
    });

    Ok(())
}
