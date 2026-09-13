use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Mint account data could not be parsed")]
    InvalidMintData,
    #[msg("Mint does not have the ConfidentialTransferMint extension enabled")]
    MintMissingConfidentialTransfer,
}
