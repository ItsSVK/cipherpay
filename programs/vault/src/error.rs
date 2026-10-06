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
    #[msg("An operator expiry must be 0 (never) or a time in the future")]
    InvalidOperatorExpiry,
}
