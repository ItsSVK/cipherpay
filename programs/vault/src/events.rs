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

/// Emitted by `wrap_confidential`. `wrapped_mint`/`wrapped_token_account`
/// are `token_wrap_compliance`'s accounts, not `vault`'s -- recorded here
/// only for indexers, since `vault` itself keeps no bookkeeping state for
/// wrapping (same no-vault-state posture as `CreateConfidentialAccountEvent`).
#[event]
pub struct WrapConfidentialEvent {
    pub owner: Pubkey,
    pub unwrapped_mint: Pubkey,
    pub wrapped_mint: Pubkey,
    pub amount: u64,
}

/// Emitted by `unwrap_confidential`. See `WrapConfidentialEvent` for why
/// there's no `vault` field.
#[event]
pub struct UnwrapConfidentialEvent {
    pub owner: Pubkey,
    pub unwrapped_mint: Pubkey,
    pub wrapped_mint: Pubkey,
    pub amount: u64,
}

/// Emitted by `transfer_confidential`. Deliberately has no amount field --
/// that's the entire point of a confidential transfer. No `vault` field
/// either, same reasoning as `CreateConfidentialAccountEvent`.
#[event]
pub struct TransferConfidentialEvent {
    pub sender: Pubkey,
    pub mint: Pubkey,
    pub source_token_account: Pubkey,
    pub destination_token_account: Pubkey,
}

/// Emitted by `withdraw_confidential`. Unlike `TransferConfidentialEvent`,
/// `amount` is included here on purpose -- Withdraw is the deliberate
/// disclosure point in this design (`PRODUCT.md` §4.4), not something to
/// obscure.
#[event]
pub struct WithdrawConfidentialEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub amount: u64,
}
