//! PDA derivation helpers, mirroring the seeds used in the program itself.

use solana_address::Address;

use crate::common::env::to_address;

/// Derives the vault PDA for `(authority, mint)`.
pub fn vault_pda(authority: Address, mint: Address) -> (Address, u8) {
    Address::find_program_address(
        &[vault::VAULT_SEED, authority.as_ref(), mint.as_ref()],
        &to_address(vault::ID),
    )
}

/// Derives the per-user PDA for `(vault, user)`.
pub fn user_account_pda(vault: Address, user: Address) -> (Address, u8) {
    Address::find_program_address(
        &[vault::USER_SEED, vault.as_ref(), user.as_ref()],
        &to_address(vault::ID),
    )
}
