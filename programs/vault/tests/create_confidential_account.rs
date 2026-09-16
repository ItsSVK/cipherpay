mod common;

use common::{
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    token_state::confidential_transfer_extension,
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// The confidential P2P transfer primitive: a wallet sets up its own
/// confidential account for a mint with no `initialize_vault` step, no
/// `Vault`, and no bookkeeping PDA at all -- unlike `create_user_account`,
/// which requires an existing vault.
#[test]
fn create_confidential_account_needs_no_vault_at_all() {
    let mut svm = setup_svm();
    let owner = funded_keypair(&mut svm);
    let mint_authority = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    // Note: no `ix::initialize` call anywhere in this test -- that's the
    // whole point.
    let mint = mint::create_confidential_mint(
        &mut svm,
        &mint_authority,
        &mint_keypair,
        6,
        mint_authority.pubkey(),
    );

    let keys = ConfidentialKeys::new_rand();
    let token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    let token_account = ix::create_confidential_account(
        &mut svm,
        &owner,
        mint,
        token_program,
        associated_token_program,
        &keys,
    );

    let token_account_data = svm
        .get_account(&token_account)
        .expect("token account should exist after create_confidential_account");
    assert_eq!(token_account_data.owner, token_program);

    let extension = confidential_transfer_extension(&token_account_data.data);
    assert_eq!(
        extension.elgamal_pubkey.0,
        keys.elgamal_pubkey_bytes(),
        "the registered ElGamal pubkey should match what the caller proved ownership of"
    );
}

/// A second, unrelated wallet setting up its own account for the same mint
/// works completely independently -- nothing here is scoped by any vault or
/// admin, which is the actual point of this instruction existing.
#[test]
fn create_confidential_account_works_for_multiple_independent_owners() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    let mint = mint::create_confidential_mint(
        &mut svm,
        &mint_authority,
        &mint_keypair,
        6,
        mint_authority.pubkey(),
    );

    let token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    let alice = funded_keypair(&mut svm);
    let bob = funded_keypair(&mut svm);
    let alice_keys = ConfidentialKeys::new_rand();
    let bob_keys = ConfidentialKeys::new_rand();

    let alice_token_account = ix::create_confidential_account(
        &mut svm,
        &alice,
        mint,
        token_program,
        associated_token_program,
        &alice_keys,
    );
    let bob_token_account = ix::create_confidential_account(
        &mut svm,
        &bob,
        mint,
        token_program,
        associated_token_program,
        &bob_keys,
    );

    assert_ne!(alice_token_account, bob_token_account);

    let alice_data = svm.get_account(&alice_token_account).unwrap();
    let bob_data = svm.get_account(&bob_token_account).unwrap();
    assert_eq!(
        confidential_transfer_extension(&alice_data.data).elgamal_pubkey.0,
        alice_keys.elgamal_pubkey_bytes()
    );
    assert_eq!(
        confidential_transfer_extension(&bob_data.data).elgamal_pubkey.0,
        bob_keys.elgamal_pubkey_bytes()
    );
}
