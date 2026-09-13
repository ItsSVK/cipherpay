use anchor_lang::prelude::*;
use spl_token_2022::{
    extension::{
        confidential_transfer::ConfidentialTransferMint, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::Mint as SplMint,
};

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
