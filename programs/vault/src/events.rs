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

/// Emitted by `create_confidential_account` -- deliberately has no `vault`
/// field, unlike every event above it. This is the P2P-transfer primitive
/// (`PRODUCT.md` §1/§11): a wallet setting up its own confidential account
/// for a mint, with no vault/treasury/employee relationship involved at all.
#[event]
pub struct CreateConfidentialAccountEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub token_account: Pubkey,
}
