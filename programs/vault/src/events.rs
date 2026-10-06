use anchor_lang::prelude::*;

#[event]
pub struct InitializeVaultEvent {
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
/// (`PRODUCT.md` §4, Phase 0 primitives): a wallet setting up its own confidential account
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

/// Emitted by `withdraw_confidential`. Unlike `PayEmployeeEvent`,
/// `amount` is included here on purpose -- Withdraw is the deliberate
/// disclosure point in this design (`PRODUCT.md` §7.4), not something to
/// obscure.
#[event]
pub struct WithdrawConfidentialEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub amount: u64,
}

/// Emitted by `pay_employee`. Deliberately has no plaintext amount: the amount
/// appears only as its two auditor-encrypted halves (lo 16 bits, hi 32 bits),
/// which the auditor decrypts and recombines as `lo + hi * 2^16`.
#[event]
pub struct PayEmployeeEvent {
    pub vault: Pubkey,
    /// Who signed this payment: the vault's admin, or its authorized operator. Lets an auditor tell the two apart.
    pub signer: Pubkey,
    pub employee: Pubkey,
    pub employee_token_account: Pubkey,
    pub auditor_ciphertext_lo: [u8; 64],
    pub auditor_ciphertext_hi: [u8; 64],
}

/// Emitted by `pause_payroll`.
#[event]
pub struct PausePayrollEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
}

/// Emitted by `resume_payroll`.
#[event]
pub struct ResumePayrollEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
}

/// Emitted by `set_operator`. `operator` is `Pubkey::default()` when the operator was revoked.
#[event]
pub struct SetOperatorEvent {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub expires_at: i64,
    /// Payments the operator may still make (0 when revoked).
    pub payments_left: u32,
}
