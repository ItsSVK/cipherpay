use anchor_lang::prelude::*;
use spl_token_2022_interface::{
    extension::{
        confidential_transfer::ConfidentialTransferMint, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::Mint as SplMint,
};

use crate::error::ConfidentialTokenHelperError;

/// Confirms `mint_account_info` is a Token-2022 mint with the
/// `ConfidentialTransferMint` extension present. Anchor's
/// `InterfaceAccount<Mint>` only validates the base 82-byte layout and
/// ownership by *some* token program -- it does not inspect extensions, so
/// any instruction that depends on confidential transfers being enabled
/// needs this manual check.
pub fn assert_confidential_transfer_enabled(mint_account_info: &AccountInfo) -> Result<()> {
    let data = mint_account_info.try_borrow_data()?;

    let mint_with_extensions = StateWithExtensions::<SplMint>::unpack(&data)
        .map_err(|_| error!(ConfidentialTokenHelperError::InvalidMintData))?;

    mint_with_extensions
        .get_extension::<ConfidentialTransferMint>()
        .map_err(|_| error!(ConfidentialTokenHelperError::MintMissingConfidentialTransfer))?;

    Ok(())
}
