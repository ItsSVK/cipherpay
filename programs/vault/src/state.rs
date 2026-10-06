use anchor_lang::prelude::*;

use crate::constants::VAULT_SEED;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey, // who can administer this vault (e.g. add employees, set auditor)
    pub mint: Pubkey,      // which Token-2022 confidential mint this vault operates on
    pub bump: u8, // the PDA bump seed, stored so later instructions don't have to search for it
    pub paused: bool, // the pause flag we discussed earlier
    pub treasury_token_account: Pubkey, // the vault PDA-owned confidential token account funds are paid out from
    pub treasury_elgamal_pubkey: Pubkey, // the admin's ElGamal pubkey, registered on the treasury account
    pub treasury_configured: bool, // set once configure_treasury_account has run
}

impl Vault {
    /// The `invoke_signed` seeds for this vault's own PDA. Needed anywhere
    /// the vault PDA is the *authority* on a CPI -- the treasury token
    /// account's Token-2022 owner -- rather than a human wallet: reallocate/
    /// configure (`configure_treasury_account`), deposit/apply-pending
    /// (`deposit_confidential`/`apply_treasury_pending`), and eventually the
    /// outgoing `Transfer` in `pay_employee`/`batch_pay`.
    pub fn signer_seeds(&self) -> [Vec<u8>; 4] {
        [
            VAULT_SEED.to_vec(),
            self.authority.to_bytes().to_vec(),
            self.mint.to_bytes().to_vec(),
            vec![self.bump],
        ]
    }
}

/// Optional delegation for payroll. The vault's admin can authorize one `operator` key to call `pay_employee` (and nothing else)
/// on the admin's behalf, so a payroll run doesn't need the admin's wallet to approve every payment.
///
/// This is deliberately a separate PDA (`[OPERATOR_SEED, vault]`) rather than extra fields on `Vault`: `Vault`'s layout stays
/// exactly as it was, so vaults created before this existed keep deserializing and keep working with no migration.
///
/// The operator can pay any employee account that is set up to receive confidential pay, and the amounts are encrypted, so the
/// program cannot cap them. That is the trade-off of delegating. The admin limits the exposure with `expires_at` and by revoking
/// (setting the operator to the default key). Pausing the vault blocks the operator too.
#[account]
#[derive(InitSpace)]
pub struct OperatorConfig {
    /// The vault this delegation belongs to (also in the PDA seeds; stored so an account read on its own is self-describing).
    pub vault: Pubkey,
    /// The key allowed to call `pay_employee`. `Pubkey::default()` means no operator (revoked).
    pub operator: Pubkey,
    /// Unix timestamp after which the operator can no longer pay. Never 0 for a live operator (see `MAX_OPERATOR_TTL_SECONDS`).
    pub expires_at: i64,
    /// How many more payments the operator may make. Each operator-signed `pay_employee` uses one; admin-signed ones don't. The
    /// amounts are encrypted so the program can't cap value, but it can cap the number of payments.
    pub payments_left: u32,
    /// Replay counter for offline authorizations. A signed message must carry this exact value, and every change to this
    /// config increments it, so one signed message can be used exactly once. See `authorize_operator`.
    pub seq: u64,
    pub bump: u8,
}
