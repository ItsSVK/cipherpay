use anchor_lang::prelude::*;
use solana_zk_elgamal_proof_interface::proof_data::{
    PubkeyValidityProofContext, PubkeyValidityProofData,
};
use spl_token_confidential_transfer_proof_extraction::instruction::verify_and_extract_context;

use crate::error::ConfidentialTokenHelperError;

/// Confirms that the instruction immediately preceding this one in the same
/// transaction is a `VerifyPubkeyValidity` proof from the ZK ElGamal proof
/// program certifying `expected_elgamal_pubkey`.
///
/// Relative instruction offsets (`-1` here) are always relative to the
/// current *top-level* transaction instruction, never to CPI depth -- so
/// this works whether it's called directly from an instruction handler or
/// from inside a nested CPI. See the "Hard-won lessons" entry in this
/// workspace's `CLAUDE.md` for the full reasoning; this function is the
/// canonical implementation that entry describes.
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
        return err!(ConfidentialTokenHelperError::ElgamalPubkeyMismatch);
    }

    Ok(())
}
