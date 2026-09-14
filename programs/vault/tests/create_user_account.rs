mod common;

use anchor_lang::AccountDeserialize;
use common::{
    env::{funded_keypair, setup_svm, to_address, to_anchor_pubkey},
    ix, mint,
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vault::UserAccount;

#[test]
fn create_user_account_registers_membership_and_confidential_token_account() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let user = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    let mint = mint::create_confidential_mint(&mut svm, &admin, &mint_keypair, 6, admin.pubkey());
    let vault_address = ix::initialize(&mut svm, &admin, mint);

    let keys = ConfidentialKeys::new_rand();
    let token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    let (user_account, user_token_account) = ix::create_user_account(
        &mut svm,
        &user,
        vault_address,
        mint,
        token_program,
        associated_token_program,
        &keys,
    );

    // The vault's own membership record reflects what was registered.
    let user_account_data = svm
        .get_account(&user_account)
        .expect("user_account PDA should exist after create_user_account");
    let user_state = UserAccount::try_deserialize(&mut user_account_data.data.as_slice())
        .expect("user_account should deserialize as a UserAccount");
    assert_eq!(user_state.vault, to_anchor_pubkey(vault_address));
    assert_eq!(user_state.owner, to_anchor_pubkey(user.pubkey()));
    assert_eq!(user_state.token_account, to_anchor_pubkey(user_token_account));
    assert_eq!(
        user_state.elgamal_pubkey,
        to_anchor_pubkey(solana_address::Address::from(keys.elgamal_pubkey_bytes()))
    );
    assert!(user_state.active);

    // The token account itself was actually created, owned by Token-2022.
    let token_account = svm
        .get_account(&user_token_account)
        .expect("associated token account should exist after create_user_account");
    assert_eq!(token_account.owner, token_program);
}
