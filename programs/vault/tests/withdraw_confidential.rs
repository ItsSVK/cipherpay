mod common;

use common::{
    confidential_proof::setup_withdraw_proof_contexts,
    env::{funded_keypair, setup_svm},
    ix, mint,
    token_state::{available_balance, base_amount, decryptable_available_balance},
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_zk_sdk::encryption::auth_encryption::AeCiphertext;
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::{
    extension::confidential_transfer::instruction::{apply_pending_balance, deposit},
    instruction::mint_to,
};

/// The disclosure half of the round trip: fund a confidential available
/// balance (plain `MintTo` -> `Deposit` -> `ApplyPendingBalance`, same
/// wallet-signed pattern as `transfer_confidential`'s test), then withdraw
/// part of it back into the public balance. Confirms both the public
/// balance (plaintext, since Withdraw deliberately discloses `amount`) and
/// the remaining confidential balance (decrypted with the owner's own AES
/// key) land where expected.
#[test]
fn withdraw_confidential_moves_value_back_to_the_public_balance() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let owner = funded_keypair(&mut svm);

    let mint_keypair = Keypair::new();
    let mint = mint::create_confidential_mint(
        &mut svm,
        &mint_authority,
        &mint_keypair,
        6,
        mint_authority.pubkey(),
    );

    let token_program = spl_token_2022_interface::ID;
    let associated_token_program =
        common::env::to_address(anchor_spl::associated_token::ID);

    let keys = ConfidentialKeys::new_rand();
    let token_account = ix::create_confidential_account(
        &mut svm,
        &owner,
        mint,
        token_program,
        associated_token_program,
        &keys,
    );

    // Fund the confidential available balance: public mint -> pending
    // (Deposit) -> available (ApplyPendingBalance). Plain, wallet-signed
    // Token-2022 calls; no vault instruction involved.
    let deposit_amount: u64 = 1_000_000;
    let mint_to_ix = mint_to(
        &token_program,
        &mint,
        &token_account,
        &mint_authority.pubkey(),
        &[],
        deposit_amount,
    )
    .expect("failed to build MintTo instruction");
    ix::send(&mut svm, &[mint_to_ix], &mint_authority, &[]);

    let deposit_ix = deposit(
        &token_program,
        &token_account,
        &mint,
        deposit_amount,
        6,
        &owner.pubkey(),
        &[],
    )
    .expect("failed to build Deposit instruction");
    ix::send(&mut svm, &[deposit_ix], &owner, &[]);

    let new_decryptable_balance = keys.ae_key.encrypt(deposit_amount).to_bytes();
    let apply_pending_ix = apply_pending_balance(
        &token_program,
        &token_account,
        1,
        &PodAeCiphertext(new_decryptable_balance),
        &owner.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[apply_pending_ix], &owner, &[]);

    // Now withdraw part of the confidential available balance back into the
    // public balance.
    let withdraw_amount: u64 = 250_000;
    let account_data = svm.get_account(&token_account).unwrap();
    let contexts = setup_withdraw_proof_contexts(
        &mut svm,
        &owner,
        available_balance(&account_data.data),
        decryptable_available_balance(&account_data.data),
        withdraw_amount,
        &keys.elgamal,
        &keys.ae_key,
    );

    ix::withdraw_confidential(
        &mut svm,
        &owner,
        mint,
        token_account,
        contexts.equality_context,
        contexts.range_context,
        token_program,
        withdraw_amount,
        contexts.new_decryptable_available_balance,
    );

    let account_data = svm.get_account(&token_account).unwrap();
    assert_eq!(
        base_amount(&account_data.data),
        withdraw_amount,
        "the withdrawn amount should land in the public balance, in plaintext"
    );

    let decryptable_balance =
        AeCiphertext::from_bytes(&decryptable_available_balance(&account_data.data))
            .expect("failed to parse decryptable balance");
    let decrypted_balance = decryptable_balance
        .decrypt(&keys.ae_key)
        .expect("failed to decrypt remaining available balance");
    assert_eq!(
        decrypted_balance,
        deposit_amount - withdraw_amount,
        "the confidential available balance should be debited by the withdrawn amount"
    );
}
