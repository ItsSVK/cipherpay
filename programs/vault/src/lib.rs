pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

declare_id!("ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
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
}
