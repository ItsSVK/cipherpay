mod common;

use common::{
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    token_state::{available_balance, decryptable_available_balance},
    transfer_proof::setup_transfer_proof_contexts,
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

/// The full P2P confidential send, end to end: fund a sender's confidential
/// available balance (mint -> deposit -> apply pending, all plain Token-2022
/// calls -- no `Vault` involved anywhere in this test), transfer part of it
/// confidentially to an independent recipient, and confirm both sides'
/// decrypted balances land where expected. Nothing about the transferred
/// amount is ever asserted from on-chain plaintext state -- only from
/// decrypting with each party's own AES key, exactly as a real client would.
#[test]
fn transfer_confidential_moves_value_between_two_p2p_accounts() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let sender = funded_keypair(&mut svm);
    let recipient = funded_keypair(&mut svm);

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

    let sender_keys = ConfidentialKeys::new_rand();
    let recipient_keys = ConfidentialKeys::new_rand();

    let sender_token_account = ix::create_confidential_account(
        &mut svm,
        &sender,
        mint,
        token_program,
        associated_token_program,
        &sender_keys,
    );
    let recipient_token_account = ix::create_confidential_account(
        &mut svm,
        &recipient,
        mint,
        token_program,
        associated_token_program,
        &recipient_keys,
    );

    // Fund the sender: public mint -> pending (Deposit) -> available
    // (ApplyPendingBalance). All plain, wallet-signed Token-2022 calls; no
    // vault instruction needed since there's no PDA authority involved.
    let deposit_amount: u64 = 1_000_000;
    let mint_to_ix = mint_to(
        &token_program,
        &mint,
        &sender_token_account,
        &mint_authority.pubkey(),
        &[],
        deposit_amount,
    )
    .expect("failed to build MintTo instruction");
    ix::send(&mut svm, &[mint_to_ix], &mint_authority, &[]);

    let deposit_ix = deposit(
        &token_program,
        &sender_token_account,
        &mint,
        deposit_amount,
        6,
        &sender.pubkey(),
        &[],
    )
    .expect("failed to build Deposit instruction");
    ix::send(&mut svm, &[deposit_ix], &sender, &[]);

    let sender_new_decryptable_balance = sender_keys.ae_key.encrypt(deposit_amount).to_bytes();
    let apply_pending_ix = apply_pending_balance(
        &token_program,
        &sender_token_account,
        1,
        &PodAeCiphertext(sender_new_decryptable_balance),
        &sender.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[apply_pending_ix], &sender, &[]);

    // Now the sender has `deposit_amount` in their confidential *available*
    // balance. Generate the three transfer proofs and their context-state
    // accounts, then send part of it to the recipient.
    let transfer_amount: u64 = 400_000;
    let sender_account_data = svm.get_account(&sender_token_account).unwrap();
    let contexts = setup_transfer_proof_contexts(
        &mut svm,
        &sender,
        available_balance(&sender_account_data.data),
        decryptable_available_balance(&sender_account_data.data),
        transfer_amount,
        &sender_keys.elgamal,
        &sender_keys.ae_key,
        recipient_keys.elgamal.pubkey(),
    );

    ix::transfer_confidential(
        &mut svm,
        &sender,
        mint,
        sender_token_account,
        recipient_token_account,
        contexts.equality_context,
        contexts.ciphertext_validity_context,
        contexts.range_context,
        token_program,
        contexts.new_source_decryptable_available_balance,
        contexts.transfer_amount_auditor_ciphertext_lo,
        contexts.transfer_amount_auditor_ciphertext_hi,
    );

    // The recipient applies their own pending balance (the transfer credited
    // pending, not available) to see the received amount.
    let recipient_new_decryptable_balance =
        recipient_keys.ae_key.encrypt(transfer_amount).to_bytes();
    let recipient_apply_pending_ix = apply_pending_balance(
        &token_program,
        &recipient_token_account,
        1,
        &PodAeCiphertext(recipient_new_decryptable_balance),
        &recipient.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[recipient_apply_pending_ix], &recipient, &[]);

    let sender_account_data = svm.get_account(&sender_token_account).unwrap();
    let sender_decryptable_balance =
        AeCiphertext::from_bytes(&decryptable_available_balance(&sender_account_data.data))
            .expect("failed to parse sender decryptable balance");
    let sender_decrypted_balance = sender_decryptable_balance
        .decrypt(&sender_keys.ae_key)
        .expect("failed to decrypt sender available balance");
    assert_eq!(
        sender_decrypted_balance,
        deposit_amount - transfer_amount,
        "sender's available balance should be debited by the transferred amount"
    );

    let recipient_account_data = svm.get_account(&recipient_token_account).unwrap();
    let recipient_decryptable_balance =
        AeCiphertext::from_bytes(&decryptable_available_balance(&recipient_account_data.data))
            .expect("failed to parse recipient decryptable balance");
    let recipient_decrypted_balance = recipient_decryptable_balance
        .decrypt(&recipient_keys.ae_key)
        .expect("failed to decrypt recipient available balance");
    assert_eq!(
        recipient_decrypted_balance, transfer_amount,
        "recipient's available balance should be credited with the transferred amount"
    );
}
