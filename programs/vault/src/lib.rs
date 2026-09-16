pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    /// Confidential P2P transfer primitive: sets up a confidential
    /// Token-2022 account for the caller's own wallet, on any
    /// confidential-transfer-enabled mint. No `Vault` involved -- see
    /// `PRODUCT.md` §1/§11 for why this instruction exists separately from
    /// `create_user_account` below rather than reusing it.
    pub fn create_confidential_account(
        ctx: Context<CreateConfidentialAccount>,
        elgamal_pubkey: [u8; 32],
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        crate::instructions::create_confidential_account::handle_create_confidential_account(
            ctx,
            elgamal_pubkey,
            decryptable_zero_balance,
        )
    }

    pub fn create_user_account(
        ctx: Context<CreateUserAccount>,
        elgamal_pubkey: [u8; 32],
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        crate::instructions::create_user_account::handle_create_user_account(
            ctx,
            elgamal_pubkey,
            decryptable_zero_balance,
        )
    }

    pub fn configure_treasury_account(
        ctx: Context<ConfigureTreasuryAccount>,
        elgamal_pubkey: [u8; 32],
        decryptable_zero_balance: [u8; 36],
    ) -> Result<()> {
        crate::instructions::configure_treasury_account::handle_configure_treasury_account(
            ctx,
            elgamal_pubkey,
            decryptable_zero_balance,
        )
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        crate::instructions::fund_treasury::handle_fund_treasury(ctx, amount)
    }

    pub fn deposit_confidential(ctx: Context<DepositConfidential>, amount: u64) -> Result<()> {
        crate::instructions::deposit_confidential::handle_deposit_confidential(ctx, amount)
    }

    /// Moves a real asset (e.g. USDC) into its wrapped, confidential-
    /// transfer-capable Token-2022 representation via CPI into
    /// `native_programs/token_wrap_compliance`. No `Vault` involved -- see
    /// `PRODUCT.md` §1/§11.
    pub fn wrap_confidential(ctx: Context<WrapConfidential>, amount: u64) -> Result<()> {
        crate::instructions::wrap_confidential::handle_wrap_confidential(ctx, amount)
    }

    /// Reverses `wrap_confidential`. No `Vault` involved.
    pub fn unwrap_confidential(ctx: Context<UnwrapConfidential>, amount: u64) -> Result<()> {
        crate::instructions::unwrap_confidential::handle_unwrap_confidential(ctx, amount)
    }

    /// The actual P2P confidential send. See `instructions/transfer_confidential.rs`
    /// for why this only accepts context-state-account proofs, not the
    /// same-transaction instruction-offset form used elsewhere in this
    /// program.
    pub fn transfer_confidential(
        ctx: Context<TransferConfidential>,
        new_source_decryptable_available_balance: [u8; 36],
        transfer_amount_auditor_ciphertext_lo: [u8; 64],
        transfer_amount_auditor_ciphertext_hi: [u8; 64],
    ) -> Result<()> {
        crate::instructions::transfer_confidential::handle_transfer_confidential(
            ctx,
            new_source_decryptable_available_balance,
            transfer_amount_auditor_ciphertext_lo,
            transfer_amount_auditor_ciphertext_hi,
        )
    }

    /// Moves `amount` from a confidential available balance back into the
    /// public balance. `amount` is a plain, public argument -- the
    /// deliberate disclosure point in this design (see
    /// `instructions/withdraw_confidential.rs`).
    pub fn withdraw_confidential(
        ctx: Context<WithdrawConfidential>,
        amount: u64,
        new_decryptable_available_balance: [u8; 36],
    ) -> Result<()> {
        crate::instructions::withdraw_confidential::handle_withdraw_confidential(
            ctx,
            amount,
            new_decryptable_available_balance,
        )
    }

    pub fn apply_treasury_pending(
        ctx: Context<ApplyTreasuryPending>,
        expected_pending_balance_credit_counter: u64,
        new_decryptable_available_balance: [u8; 36],
    ) -> Result<()> {
        crate::instructions::apply_treasury_pending::handle_apply_treasury_pending(
            ctx,
            expected_pending_balance_credit_counter,
            new_decryptable_available_balance,
        )
    }
}
