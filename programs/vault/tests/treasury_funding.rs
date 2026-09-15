mod common;

use common::{
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    token_state::{base_amount, confidential_transfer_extension},
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Walks the full treasury-funding pipeline: fund_treasury (plain public
/// transfer in) -> deposit_confidential (public -> pending) ->
/// apply_treasury_pending (pending -> available), asserting the
/// plaintext-visible state changes at each step.
#[test]
fn treasury_funding_flow_moves_a_deposit_from_public_to_available_balance() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let funder = funded_keypair(&mut svm);
    let mint_keypair = Keypair::new();
    let funder_token_account_keypair = Keypair::new();

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

    const FUND_AMOUNT: u64 = 1_000_000;

    let funder_token_account = mint::create_and_fund_token_account(
        &mut svm,
        &funder,
        mint,
        &admin, // mint authority, set when create_confidential_mint was called
        &funder_token_account_keypair,
        funder.pubkey(),
        FUND_AMOUNT,
    );

    // fund_treasury: plain public transfer, no confidential-transfer
    // instructions involved yet.
    ix::fund_treasury(
        &mut svm,
        &funder,
        funder_token_account,
        vault_address,
        mint,
        treasury_token_account,
        token_program,
        FUND_AMOUNT,
    );

    let treasury_account_data = svm
        .get_account(&treasury_token_account)
        .expect("treasury token account should exist");
    assert_eq!(base_amount(&treasury_account_data.data), FUND_AMOUNT);

    // deposit_confidential: the funded amount moves from the public balance
    // into the pending confidential balance.
    ix::deposit_confidential(
        &mut svm,
        &admin,
        vault_address,
        mint,
        treasury_token_account,
        token_program,
        FUND_AMOUNT,
    );

    let treasury_account_data = svm
        .get_account(&treasury_token_account)
        .expect("treasury token account should exist");
    assert_eq!(
        base_amount(&treasury_account_data.data),
        0,
        "the deposited amount should have left the public balance"
    );
    let extension = confidential_transfer_extension(&treasury_account_data.data);
    assert_eq!(
        u64::from(extension.pending_balance_credit_counter),
        1,
        "one Deposit should have credited the pending balance once"
    );

    // apply_treasury_pending: folds pending into available. Only the admin
    // -- who holds the treasury's AES key -- can compute the new
    // decryptable available balance.
    let new_decryptable_available_balance = keys.ae_key.encrypt(FUND_AMOUNT).to_bytes();
    ix::apply_treasury_pending(
        &mut svm,
        &admin,
        vault_address,
        treasury_token_account,
        token_program,
        1,
        new_decryptable_available_balance,
    );

    let treasury_account_data = svm
        .get_account(&treasury_token_account)
        .expect("treasury token account should exist");
    let extension = confidential_transfer_extension(&treasury_account_data.data);
    assert_eq!(
        u64::from(extension.pending_balance_credit_counter),
        0,
        "apply_treasury_pending should reset the pending-credit counter"
    );
    assert_eq!(
        extension.decryptable_available_balance.0,
        new_decryptable_available_balance
    );
}
