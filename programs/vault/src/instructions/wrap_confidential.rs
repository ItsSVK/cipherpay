use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    events::WrapConfidentialEvent, TOKEN_WRAP_COMPLIANCE_PROGRAM_ID, WRAPPED_MINT_AUTHORITY_SEED,
    WRAPPED_MINT_SEED,
};

/// Moves `amount` of a real SPL asset (e.g. USDC) into its wrapped,
/// confidential-transfer-capable Token-2022 representation, via CPI into
/// `native_programs/token_wrap_compliance` (our fork of spl-token-wrap with
/// a compliance-focused mint customizer). This only credits the wrapped
/// mint's *public* balance -- moving it into a confidential balance from
/// there is a separate step the client does directly via Token-2022's
/// `Deposit`/`ApplyPendingBalance` (no vault instruction needed).
///
/// Assumes `wrapped_mint` already exists: `token_wrap_compliance`'s
/// `CreateMint` is a one-time, per-(unwrapped_mint, wrapped_token_program)
/// bootstrap, not a per-user action, so it isn't wired in here.
///
/// No `Vault` involved, same as `create_confidential_account` -- wrapping is
/// a P2P-transfer primitive, not a payroll one.
#[derive(Accounts)]
pub struct WrapConfidential<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The real asset's mint (e.g. USDC). Either classic SPL Token or
    /// Token-2022 -- `token_wrap_compliance` supports both as the unwrapped
    /// side.
    pub unwrapped_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = unwrapped_mint,
        token::authority = owner,
    )]
    pub owner_unwrapped_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: PDA owned by `token_wrap_compliance`
    /// (seeds `["mint", unwrapped_mint, wrapped_token_program]`); its supply
    /// is mutated by the CPI below.
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
    /// (seeds `["authority", wrapped_mint]`) -- mint authority for
    /// `wrapped_mint` and owner of `escrow`. Never a signer here; the
    /// program signs for it internally via its own `invoke_signed`.
    #[account(
        seeds = [WRAPPED_MINT_AUTHORITY_SEED, wrapped_mint.key().as_ref()],
        bump,
        seeds::program = token_wrap_program.key(),
    )]
    pub wrapped_mint_authority: UncheckedAccount<'info>,

    /// CHECK: custodies the real-asset backing for outstanding wrapped
    /// supply. Created idempotently below if this is the first wrap for
    /// this mint pair.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &wrapped_mint_authority.key(),
            &unwrapped_mint.key(),
            &unwrapped_token_program.key(),
        ),
    )]
    pub escrow: UncheckedAccount<'info>,

    /// CHECK: the caller's own wrapped-mint token account, credited by
    /// `amount`. Created idempotently below if this is the caller's first
    /// wrap.
    #[account(
        mut,
        address = associated_token::get_associated_token_address_with_program_id(
            &owner.key(),
            &wrapped_mint.key(),
            &wrapped_token_program.key(),
        ),
    )]
    pub owner_wrapped_token_account: UncheckedAccount<'info>,

    /// CHECK: our `token_wrap_compliance` fork.
    #[account(address = TOKEN_WRAP_COMPLIANCE_PROGRAM_ID)]
    pub token_wrap_program: UncheckedAccount<'info>,

    pub unwrapped_token_program: Interface<'info, TokenInterface>,
    pub wrapped_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> WrapConfidential<'info> {
    fn create_missing_token_accounts(&self) -> Result<()> {
        associated_token::create_idempotent(CpiContext::new(
            self.associated_token_program.key(),
            associated_token::Create {
                payer: self.owner.to_account_info(),
                associated_token: self.escrow.to_account_info(),
                authority: self.wrapped_mint_authority.to_account_info(),
                mint: self.unwrapped_mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.unwrapped_token_program.to_account_info(),
            },
        ))?;

        associated_token::create_idempotent(CpiContext::new(
            self.associated_token_program.key(),
            associated_token::Create {
                payer: self.owner.to_account_info(),
                associated_token: self.owner_wrapped_token_account.to_account_info(),
                authority: self.owner.to_account_info(),
                mint: self.wrapped_mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.wrapped_token_program.to_account_info(),
            },
        ))
    }

    /// Hand-built CPI (see the module-level note on
    /// `TOKEN_WRAP_COMPLIANCE_PROGRAM_ID` in `constants.rs` for why this
    /// isn't built via `token_wrap_compliance::instruction::wrap`). Account
    /// order and instruction encoding must match
    /// `native_programs/token_wrap_compliance/src/instruction.rs`'s `Wrap`
    /// variant exactly.
    fn wrap(&self, amount: u64) -> Result<()> {
        let mut data = vec![1u8];
        data.extend_from_slice(&amount.to_le_bytes());

        let ix = Instruction {
            program_id: self.token_wrap_program.key(),
            accounts: vec![
                AccountMeta::new(self.owner_wrapped_token_account.key(), false),
                AccountMeta::new(self.wrapped_mint.key(), false),
                AccountMeta::new_readonly(self.wrapped_mint_authority.key(), false),
                AccountMeta::new_readonly(self.unwrapped_token_program.key(), false),
                AccountMeta::new_readonly(self.wrapped_token_program.key(), false),
                AccountMeta::new(self.owner_unwrapped_token_account.key(), false),
                AccountMeta::new_readonly(self.unwrapped_mint.key(), false),
                AccountMeta::new(self.escrow.key(), false),
                AccountMeta::new_readonly(self.owner.key(), true),
            ],
            data,
        };

        invoke(
            &ix,
            &[
                self.owner_wrapped_token_account.to_account_info(),
                self.wrapped_mint.to_account_info(),
                self.wrapped_mint_authority.to_account_info(),
                self.unwrapped_token_program.to_account_info(),
                self.wrapped_token_program.to_account_info(),
                self.owner_unwrapped_token_account.to_account_info(),
                self.unwrapped_mint.to_account_info(),
                self.escrow.to_account_info(),
                self.owner.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

pub fn handle_wrap_confidential(ctx: Context<WrapConfidential>, amount: u64) -> Result<()> {
    ctx.accounts.create_missing_token_accounts()?;
    ctx.accounts.wrap(amount)?;

    emit!(WrapConfidentialEvent {
        owner: ctx.accounts.owner.key(),
        unwrapped_mint: ctx.accounts.unwrapped_mint.key(),
        wrapped_mint: ctx.accounts.wrapped_mint.key(),
        amount,
    });

    Ok(())
}
