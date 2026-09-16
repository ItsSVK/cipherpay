use anchor_lang::prelude::*;

#[error_code]
pub enum ConfidentialTokenHelperError {
    #[msg("ElGamal pubkey does not match the preceding pubkey validity proof")]
    ElgamalPubkeyMismatch,
    #[msg("Mint account data could not be parsed")]
    InvalidMintData,
    #[msg("Mint does not have the ConfidentialTransferMint extension enabled")]
    MintMissingConfidentialTransfer,
}
