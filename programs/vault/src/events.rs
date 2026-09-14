use anchor_lang::prelude::*;

#[event]
pub struct InitializeEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct ConfigureTreasuryAccountEvent {
    pub vault: Pubkey,
    pub treasury_token_account: Pubkey,
}
