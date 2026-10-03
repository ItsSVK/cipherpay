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
