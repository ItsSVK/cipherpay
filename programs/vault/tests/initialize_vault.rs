mod common;

use anchor_lang::AccountDeserialize;
use common::{
    env::{funded_keypair, setup_svm, to_address, to_anchor_pubkey},
    ix, mint,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vault::Vault;

#[test]
fn initialize_vault_creates_a_vault_for_a_confidential_mint() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    let mint = mint::create_confidential_mint(&mut svm, &admin, &mint_keypair, 6, admin.pubkey());

    let vault_address = ix::initialize_vault(&mut svm, &admin, mint);

    let vault_account = svm
        .get_account(&vault_address)
        .expect("vault account should exist after initialize_vault");
    assert_eq!(vault_account.owner, to_address(vault::ID));

    let vault_state = Vault::try_deserialize(&mut vault_account.data.as_slice())
        .expect("vault account should deserialize as a Vault");
    assert_eq!(vault_state.authority, to_anchor_pubkey(admin.pubkey()));
    assert_eq!(vault_state.mint, to_anchor_pubkey(mint));
    assert!(!vault_state.paused);
}
