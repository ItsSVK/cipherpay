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
