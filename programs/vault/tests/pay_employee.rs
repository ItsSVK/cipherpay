mod common;

use common::{
    confidential_proof::TransferProofContexts,
    env::funded_keypair,
    ix,
    payroll::{assert_rejected_with, parse_pay_employee_event, setup_payroll, token_program, TREASURY_FUNDING},
};
use solana_address::Address;
use solana_signer::Signer;
use solana_zk_sdk::encryption::elgamal::ElGamalCiphertext;
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::extension::confidential_transfer::instruction::apply_pending_balance;
use vault::error::VaultError;

/// UC1, REQ01/REQ04/REQ05/REQ06/REQ07: the treasury pays an employee a hidden
/// amount, signing as the vault PDA, and the event lets the auditor (and only
/// the auditor) recover that amount.
#[test]
fn pay_employee_moves_a_hidden_amount_and_the_auditor_can_read_it() {
    let mut payroll = setup_payroll();
    let amount: u64 = 250_000;

    let contexts = payroll.proofs_for(amount);
    let pay_ix = payroll.pay_ix(&payroll.admin, &contexts);
    let meta = ix::send(&mut payroll.svm, &[pay_ix], &payroll.admin, &[]);

    // The employee's pending balance was credited, so they apply it (their
    // own call, their own fee) to see it as available.
    let employee_apply = apply_pending_balance(
        &token_program(),
        &payroll.employee_token_account,
        1,
        &PodAeCiphertext(payroll.employee_keys.ae_key.encrypt(amount).to_bytes()),
        &payroll.employee.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance");
    ix::send(&mut payroll.svm, &[employee_apply], &payroll.employee, &[]);

    assert_eq!(
        payroll.decrypted_available(payroll.employee_token_account, &payroll.employee_keys.ae_key),
        amount,
        "the employee should be credited the hidden amount"
    );
    assert_eq!(
        payroll.decrypted_available(payroll.treasury_token_account, &payroll.admin_keys.ae_key),
        TREASURY_FUNDING - amount,
        "the treasury should be debited the same amount"
    );

    // REQ07: the event identifies the payment, and the amount is decryptable
    // only with the auditor's secret key, as lo + hi * 2^16.
    let event = parse_pay_employee_event(&meta);
    assert_eq!(event.vault.to_bytes(), payroll.vault.to_bytes());
    assert_eq!(event.employee.to_bytes(), payroll.employee.pubkey().to_bytes());
    assert_eq!(
        event.employee_token_account.to_bytes(),
        payroll.employee_token_account.to_bytes()
    );

    let secret = payroll.auditor.elgamal.secret();
    let lo = ElGamalCiphertext::from_bytes(&event.auditor_ciphertext_lo)
        .expect("lo ciphertext")
        .decrypt_u32(secret)
        .expect("auditor should decrypt lo");
    let hi = ElGamalCiphertext::from_bytes(&event.auditor_ciphertext_hi)
        .expect("hi ciphertext")
        .decrypt_u32(secret)
        .expect("auditor should decrypt hi");
    assert_eq!(lo + (hi << 16), amount, "the auditor should recover the paid amount");
}

/// REQ02 + REQ12: a paused vault rejects `pay_employee` with `PayrollPaused`
/// (checked against the exact error code), and `resume_payroll` re-enables it
/// with the very same proofs.
#[test]
fn pay_employee_is_blocked_while_paused_and_works_after_resume() {
    let mut payroll = setup_payroll();
    let contexts = payroll.proofs_for(100_000);

    ix::pause_payroll(&mut payroll.svm, &payroll.admin, payroll.vault);
    let pay_ix = payroll.pay_ix(&payroll.admin, &contexts);
    let result = ix::try_send(&mut payroll.svm, &[pay_ix], &payroll.admin, &[]);
    assert_rejected_with(result, VaultError::PayrollPaused);

    ix::resume_payroll(&mut payroll.svm, &payroll.admin, payroll.vault);
    // The retry is byte-identical to the rejected attempt, so without a fresh
    // blockhash litesvm would dedup it as `AlreadyProcessed` (a real client
    // would simply fetch a new blockhash).
    payroll.svm.expire_blockhash();
    let pay_ix = payroll.pay_ix(&payroll.admin, &contexts);
    ix::send(&mut payroll.svm, &[pay_ix], &payroll.admin, &[]);
}

/// REQ03: only `Vault.authority` can pay. A different signer is rejected with
/// `Unauthorized`, before any proof is even looked at.
#[test]
fn pay_employee_rejects_a_signer_who_is_not_the_vault_authority() {
    let mut payroll = setup_payroll();
    let impostor = funded_keypair(&mut payroll.svm);
    let unused = Address::new_unique();
    let contexts = TransferProofContexts {
        equality_context: unused,
        ciphertext_validity_context: unused,
        range_context: unused,
        new_source_decryptable_available_balance: [0; 36],
        transfer_amount_auditor_ciphertext_lo: [0; 64],
        transfer_amount_auditor_ciphertext_hi: [0; 64],
    };

    let pay_ix = payroll.pay_ix(&impostor, &contexts);
    let result = ix::try_send(&mut payroll.svm, &[pay_ix], &impostor, &[]);
    assert_rejected_with(result, VaultError::Unauthorized);
}
