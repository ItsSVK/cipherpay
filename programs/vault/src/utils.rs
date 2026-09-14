use anchor_lang::prelude::*;
use solana_zk_elgamal_proof_interface::proof_data::{
    PubkeyValidityProofContext, PubkeyValidityProofData,
};
use spl_token_2022::{
    extension::{
        confidential_transfer::ConfidentialTransferMint, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::Mint as SplMint,
};
use spl_token_confidential_transfer_proof_extraction::instruction::verify_and_extract_context;

use crate::error::VaultError;

pub fn assert_confidential_transfer_enabled(mint_account_info: &AccountInfo) -> Result<()> {
    let data = mint_account_info.try_borrow_data()?;

    let mint_with_extensions = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(VaultError::InvalidMintData))?;

    mint_with_extensions
        .get_extension::<ConfidentialTransferMint>()
        .map_err(|_| error!(VaultError::MintMissingConfidentialTransfer))?;

    Ok(())
}

/// Confirms that the instruction immediately preceding this one in the same
/// transaction is a `VerifyPubkeyValidity` proof from the ZK ElGamal proof
/// program certifying `expected_elgamal_pubkey`.
pub fn assert_pubkey_validity_proof(
    instructions_sysvar: &AccountInfo,
    expected_elgamal_pubkey: &[u8; 32],
) -> Result<()> {
    let no_accounts: &[AccountInfo] = &[];
    let mut no_accounts_iter = no_accounts.iter();

    let context = verify_and_extract_context::<PubkeyValidityProofData, PubkeyValidityProofContext>(
        &mut no_accounts_iter,
        -1,
        Some(instructions_sysvar),
    )?;

    if context.pubkey.0 != *expected_elgamal_pubkey {
        return err!(VaultError::ElgamalPubkeyMismatch);
    }

    Ok(())
}
