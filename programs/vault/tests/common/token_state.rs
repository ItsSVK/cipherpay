//! Reads Token-2022 account state directly out of raw account bytes, for
//! asserting on things `svm.get_account` alone can't tell you (the public
//! balance, or the confidential-transfer extension's plaintext fields like
//! its pending-credit counter).

use spl_token_2022_interface::{
    extension::{
        confidential_transfer::ConfidentialTransferAccount, BaseStateWithExtensions,
        StateWithExtensions,
    },
    state::Account as TokenAccountState,
};

/// The account's ordinary (public, non-confidential) token balance.
pub fn base_amount(data: &[u8]) -> u64 {
    StateWithExtensions::<TokenAccountState>::unpack(data)
        .expect("failed to unpack token account state")
        .base
        .amount
}

/// The account's `ConfidentialTransferAccount` extension state.
pub fn confidential_transfer_extension(data: &[u8]) -> ConfidentialTransferAccount {
    let state = StateWithExtensions::<TokenAccountState>::unpack(data)
        .expect("failed to unpack token account state");

    *state
        .get_extension::<ConfidentialTransferAccount>()
        .expect("token account is missing the ConfidentialTransferAccount extension")
}

/// The account's ElGamal-encrypted available balance, raw bytes -- feeds
/// `transfer_proof::setup_transfer_proof_contexts`.
pub fn available_balance(data: &[u8]) -> [u8; 64] {
    confidential_transfer_extension(data).available_balance.0
}

/// The account's AES-encrypted (decryptable) available balance, raw bytes.
pub fn decryptable_available_balance(data: &[u8]) -> [u8; 36] {
    confidential_transfer_extension(data)
        .decryptable_available_balance
        .0
}
