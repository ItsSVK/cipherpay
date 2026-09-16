use anchor_lang::prelude::*;

#[error_code]
pub enum ConfidentialTokenHelperError {
    #[msg("ElGamal pubkey does not match the preceding pubkey validity proof")]
    ElgamalPubkeyMismatch,
}
