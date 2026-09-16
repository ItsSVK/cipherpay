mod common;

use common::{
    confidential_proof::{
        compliance_auditor_elgamal_pubkey, setup_transfer_proof_contexts,
        setup_withdraw_proof_contexts,
    },
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    pda::{escrow_address, wrapped_mint_pda},
    token_state::{available_balance, base_amount, decryptable_available_balance},
    token_wrap,
    zk::ConfidentialKeys,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_zk_sdk::encryption::auth_encryption::AeCiphertext;
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::extension::confidential_transfer::instruction::{
    apply_pending_balance, deposit,
};

fn decrypted_available_balance(data: &[u8], keys: &ConfidentialKeys) -> u64 {
    AeCiphertext::from_bytes(&decryptable_available_balance(data))
        .expect("failed to parse decryptable balance")
        .decrypt(&keys.ae_key)
        .expect("failed to decrypt available balance")
}

/// The whole P2P pipeline, chained together in one test rather than proven
/// only pairwise: a real (unwrapped) asset gets wrapped, moved into a
/// confidential balance, sent confidentially to an independent recipient,
/// withdrawn back to a public balance, and unwrapped back into the real
/// asset -- with the final real-asset balance asserted at the end, not just
/// each intermediate step in isolation. No `Vault` anywhere in this flow.
#[test]
fn wrap_transfer_withdraw_unwrap_round_trip() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let alice = funded_keypair(&mut svm);
    let bob = funded_keypair(&mut svm);

    let unwrapped_mint_keypair = Keypair::new();
    let unwrapped_mint = mint::create_plain_mint(
        &mut svm,
        &mint_authority,
        &unwrapped_mint_keypair,
        6,
        mint_authority.pubkey(),
    );

    let unwrapped_token_program = spl_token_2022_interface::ID;
    let wrapped_token_program = spl_token_2022_interface::ID;
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    // Alice acquires 1,000,000 units of the real asset (e.g. USDC).
    let alice_unwrapped_account = mint::create_and_fund_associated_token_account(
        &mut svm,
        &alice,
        unwrapped_mint,
        &mint_authority,
        alice.pubkey(),
        unwrapped_token_program,
        1_000_000,
    );

    token_wrap::create_wrapped_mint(&mut svm, &alice, unwrapped_mint, wrapped_token_program);

    // Alice sets up her confidential account for the *wrapped* mint before
    // wrapping into it -- wrap_confidential's idempotent ATA creation is a
    // no-op once this exists, and reallocate/configure work the same
    // whether or not the account already holds a public balance.
    let alice_keys = ConfidentialKeys::new_rand();
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let alice_wrapped_account = ix::create_confidential_account(
        &mut svm,
        &alice,
        wrapped_mint,
        wrapped_token_program,
        associated_token_program,
        &alice_keys,
    );

    let wrap_amount: u64 = 1_000_000;
    let credited_wrapped_account = ix::wrap_confidential(
        &mut svm,
        &alice,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        wrap_amount,
    );
    assert_eq!(
        credited_wrapped_account, alice_wrapped_account,
        "wrap_confidential should credit the same ATA create_confidential_account configured"
    );

    // Move the wrapped public balance into Alice's confidential available
    // balance: plain, wallet-signed Deposit -> ApplyPendingBalance. No
    // vault instruction -- no PDA authority is involved for a P2P account.
    let deposit_ix = deposit(
        &wrapped_token_program,
        &alice_wrapped_account,
        &wrapped_mint,
        wrap_amount,
        6,
        &alice.pubkey(),
        &[],
    )
    .expect("failed to build Deposit instruction");
    ix::send(&mut svm, &[deposit_ix], &alice, &[]);

    let alice_available_after_deposit = alice_keys.ae_key.encrypt(wrap_amount).to_bytes();
    let alice_apply_pending_ix = apply_pending_balance(
        &wrapped_token_program,
        &alice_wrapped_account,
        1,
        &PodAeCiphertext(alice_available_after_deposit),
        &alice.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[alice_apply_pending_ix], &alice, &[]);

    // Bob sets up his own confidential account for the same wrapped mint.
    let bob_keys = ConfidentialKeys::new_rand();
    let bob_wrapped_account = ix::create_confidential_account(
        &mut svm,
        &bob,
        wrapped_mint,
        wrapped_token_program,
        associated_token_program,
        &bob_keys,
    );

    // Alice sends part of her confidential balance to Bob, confidentially.
    let transfer_amount: u64 = 400_000;
    let alice_account_data = svm.get_account(&alice_wrapped_account).unwrap();
    let transfer_contexts = setup_transfer_proof_contexts(
        &mut svm,
        &alice,
        available_balance(&alice_account_data.data),
        decryptable_available_balance(&alice_account_data.data),
        transfer_amount,
        &alice_keys.elgamal,
        &alice_keys.ae_key,
        bob_keys.elgamal.pubkey(),
        Some(&compliance_auditor_elgamal_pubkey()),
    );
    ix::transfer_confidential(
        &mut svm,
        &alice,
        wrapped_mint,
        alice_wrapped_account,
        bob_wrapped_account,
        transfer_contexts.equality_context,
        transfer_contexts.ciphertext_validity_context,
        transfer_contexts.range_context,
        wrapped_token_program,
        transfer_contexts.new_source_decryptable_available_balance,
        transfer_contexts.transfer_amount_auditor_ciphertext_lo,
        transfer_contexts.transfer_amount_auditor_ciphertext_hi,
    );

    // Bob applies his pending balance (the transfer credited pending, not
    // available).
    let bob_available_after_transfer = bob_keys.ae_key.encrypt(transfer_amount).to_bytes();
    let bob_apply_pending_ix = apply_pending_balance(
        &wrapped_token_program,
        &bob_wrapped_account,
        1,
        &PodAeCiphertext(bob_available_after_transfer),
        &bob.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[bob_apply_pending_ix], &bob, &[]);

    // Bob withdraws part of his confidential balance back to the wrapped
    // mint's public balance.
    let withdraw_amount: u64 = 250_000;
    let bob_account_data = svm.get_account(&bob_wrapped_account).unwrap();
    let withdraw_contexts = setup_withdraw_proof_contexts(
        &mut svm,
        &bob,
        available_balance(&bob_account_data.data),
        decryptable_available_balance(&bob_account_data.data),
        withdraw_amount,
        &bob_keys.elgamal,
        &bob_keys.ae_key,
    );
    ix::withdraw_confidential(
        &mut svm,
        &bob,
        wrapped_mint,
        bob_wrapped_account,
        withdraw_contexts.equality_context,
        withdraw_contexts.range_context,
        wrapped_token_program,
        withdraw_amount,
        withdraw_contexts.new_decryptable_available_balance,
    );

    // Bob unwraps his freshly-withdrawn public wrapped balance back into
    // the real (unwrapped) asset.
    let bob_unwrapped_account = ix::unwrap_confidential(
        &mut svm,
        &bob,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        withdraw_amount,
    );

    // Final assertions: the real asset actually moved end to end, and both
    // parties' confidential balances (decrypted with their own keys, never
    // asserted from plaintext on-chain state) reflect the full sequence.
    let bob_unwrapped_data = svm.get_account(&bob_unwrapped_account).unwrap();
    assert_eq!(
        base_amount(&bob_unwrapped_data.data),
        withdraw_amount,
        "the real asset should have moved all the way from Alice's original \
         deposit to Bob's unwrapped account"
    );

    let escrow = escrow_address(
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
    );
    let escrow_data = svm.get_account(&escrow).unwrap();
    assert_eq!(
        base_amount(&escrow_data.data),
        wrap_amount - withdraw_amount,
        "escrow should retain the real asset backing Bob's remaining wrapped balance"
    );

    let bob_wrapped_data = svm.get_account(&bob_wrapped_account).unwrap();
    assert_eq!(
        base_amount(&bob_wrapped_data.data),
        0,
        "Bob should have unwrapped everything he withdrew, leaving no public wrapped balance"
    );

    let alice_account_data = svm.get_account(&alice_wrapped_account).unwrap();
    assert_eq!(
        decrypted_available_balance(&alice_account_data.data, &alice_keys),
        wrap_amount - transfer_amount,
        "Alice's confidential balance should be debited by the transferred amount"
    );

    let bob_account_data = svm.get_account(&bob_wrapped_account).unwrap();
    assert_eq!(
        decrypted_available_balance(&bob_account_data.data, &bob_keys),
        transfer_amount - withdraw_amount,
        "Bob's remaining confidential balance should reflect the transfer minus what he withdrew"
    );

    // Alice's real-asset account was debited by the full wrap amount, and
    // never got any of it back -- confirms nothing leaked back to her.
    let alice_unwrapped_data = svm.get_account(&alice_unwrapped_account).unwrap();
    assert_eq!(
        base_amount(&alice_unwrapped_data.data),
        1_000_000 - wrap_amount
    );
}
