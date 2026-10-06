use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Only the vault's authority can perform this action")]
    Unauthorized,
    #[msg("The vault's treasury account has already been configured")]
    TreasuryAlreadyConfigured,
    #[msg("The vault's treasury account has not been configured yet")]
    TreasuryNotConfigured,
    #[msg("Payroll is paused for this vault")]
    PayrollPaused,
    #[msg("The vault's operator authorization has expired")]
    OperatorExpired,
    #[msg("An operator expiry must be in the future and no more than 24 hours away")]
    InvalidOperatorExpiry,
    #[msg("An operator must be allowed at least one payment")]
    InvalidOperatorLimit,
    #[msg("The operator has used all the payments it was allowed")]
    OperatorLimitReached,
    #[msg("This transaction does not carry a valid Ed25519 signature from the vault's admin over this exact authorization")]
    InvalidAuthorization,
    #[msg("This authorization has already been used, or is not the next one expected")]
    AuthorizationSeqMismatch,
}
