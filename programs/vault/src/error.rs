use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Mint account data could not be parsed")]
    InvalidMintData,
    #[msg("Mint does not have the ConfidentialTransferMint extension enabled")]
    MintMissingConfidentialTransfer,
    #[msg("ElGamal pubkey does not match the preceding pubkey validity proof")]
    ElgamalPubkeyMismatch,
    #[msg("Only the vault's authority can perform this action")]
    Unauthorized,
    #[msg("The vault's treasury account has already been configured")]
    TreasuryAlreadyConfigured,
    #[msg("The vault's treasury account has not been configured yet")]
    TreasuryNotConfigured,
}
