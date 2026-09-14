mod common;

use anchor_lang::AccountDeserialize;
use common::{
    env::{funded_keypair, setup_svm, to_address, to_anchor_pubkey},
    ix, mint,
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vault::Vault;

#[test]
fn configure_treasury_account_sets_up_a_pda_owned_confidential_account() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    let mint = mint::create_confidential_mint(&mut svm, &admin, &mint_keypair, 6, admin.pubkey());
    let vault_address = ix::initialize(&mut svm, &admin, mint);

    let keys = ConfidentialKeys::new_rand();
    let token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    let treasury_token_account = ix::configure_treasury_account(
        &mut svm,
        &admin,
        vault_address,
        mint,
        token_program,
        associated_token_program,
        &keys,
    );

    // The vault's own state now points at the treasury account and records
    // the admin's ElGamal pubkey as the one authorized to decrypt it.
    let vault_account_data = svm
        .get_account(&vault_address)
        .expect("vault account should still exist");
    let vault_state = Vault::try_deserialize(&mut vault_account_data.data.as_slice())
        .expect("vault account should deserialize as a Vault");
    assert_eq!(
        vault_state.treasury_token_account,
        to_anchor_pubkey(treasury_token_account)
    );
    assert_eq!(
        vault_state.treasury_elgamal_pubkey,
        to_anchor_pubkey(solana_address::Address::from(keys.elgamal_pubkey_bytes()))
    );
    assert!(vault_state.treasury_configured);

    // The treasury token account itself was actually created, owned by
    // Token-2022 -- and its authority is the vault PDA, not the admin
    // wallet, so pay_employee/batch_pay can move funds out of it later
    // without a human co-signing every payment.
    let treasury_account = svm
        .get_account(&treasury_token_account)
        .expect("treasury token account should exist after configure_treasury_account");
    assert_eq!(treasury_account.owner, token_program);
}

#[test]
fn configure_treasury_account_rejects_a_non_admin_caller() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let impostor = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();

    let mint = mint::create_confidential_mint(&mut svm, &admin, &mint_keypair, 6, admin.pubkey());
    let vault_address = ix::initialize(&mut svm, &admin, mint);

    let keys = ConfidentialKeys::new_rand();
    let token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    let (ixs, _treasury_token_account) = ix::build_configure_treasury_account_ixs(
        &impostor,
        vault_address,
        mint,
        token_program,
        associated_token_program,
        &keys,
    );

    let blockhash = svm.latest_blockhash();
    let message = solana_message::Message::new_with_blockhash(
        &ixs,
        Some(&impostor.pubkey()),
        &blockhash,
    );
    let tx = solana_transaction::versioned::VersionedTransaction::try_new(
        solana_message::VersionedMessage::Legacy(message),
        &[&impostor],
    )
    .expect("failed to sign transaction");

    let result = svm.send_transaction(tx);
    assert!(
        result.is_err(),
        "configure_treasury_account should reject a caller who isn't the vault's admin"
    );
}
