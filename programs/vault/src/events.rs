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

#[event]
pub struct FundTreasuryEvent {
    pub vault: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DepositConfidentialEvent {
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ApplyTreasuryPendingEvent {
    pub vault: Pubkey,
}
