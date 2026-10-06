//! The payroll operator: a key the admin authorizes (once, with `set_operator`) to call `pay_employee`, and nothing else, so a
//! payroll run doesn't need the admin's wallet to approve every payment.
//!
//! What must hold: the admin always can pay; a set, unexpired operator can pay; nobody else can; the operator can do nothing
//! but pay; revoking and expiry both stop it; and pausing the vault stops it too.

mod common;

use anchor_lang::{error::ERROR_CODE_OFFSET, AccountDeserialize, AnchorDeserialize, Discriminator};
use base64::Engine;
use common::{
    confidential_proof::TransferProofContexts,
    env::{funded_keypair, setup_svm},
    ix, mint,
    pda::operator_config_pda,
    payroll::{assert_rejected_with, parse_pay_employee_event, setup_payroll, Payroll, TREASURY_FUNDING},
};
use litesvm::{types::TransactionMetadata, LiteSVM};
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::TransactionError;
use vault::{error::VaultError, OperatorConfig, SetOperatorEvent};

const NOW: i64 = 1_000_000;

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

fn operator_config(svm: &LiteSVM, vault: Address) -> OperatorConfig {
    let account = svm.get_account(&operator_config_pda(vault).0).expect("operator config should exist");
    OperatorConfig::try_deserialize(&mut account.data.as_slice()).expect("operator config should deserialize")
}

fn parse_set_operator_event(meta: &TransactionMetadata) -> SetOperatorEvent {
    meta.logs
        .iter()
        .filter_map(|line| line.strip_prefix("Program data: "))
        .filter_map(|b64| base64::engine::general_purpose::STANDARD.decode(b64).ok())
        .find(|bytes| bytes.starts_with(SetOperatorEvent::DISCRIMINATOR))
        .map(|bytes| SetOperatorEvent::deserialize(&mut &bytes[SetOperatorEvent::DISCRIMINATOR.len()..]).expect("SetOperatorEvent"))
        .expect("no SetOperatorEvent in the transaction logs")
}

/// A payroll with `NOW` as the clock, an operator key that has SOL for fees, and proofs for one payment already made.
struct Fixture {
    payroll: Payroll,
    operator: Keypair,
    contexts: TransferProofContexts,
}

fn fixture(amount: u64) -> Fixture {
    let mut payroll = setup_payroll();
    set_clock(&mut payroll.svm, NOW);
    let operator = funded_keypair(&mut payroll.svm);
    let contexts = payroll.proofs_for(amount);
    Fixture { payroll, operator, contexts }
}

/// Sends a payment signed (and paid for) by `signer`, returning the failure instead of panicking.
fn try_pay(payroll: &mut Payroll, contexts: &TransferProofContexts, signer: &Keypair) -> Result<TransactionMetadata, litesvm::types::FailedTransactionMetadata> {
    let pay_ix = payroll.pay_ix(signer, contexts);
    ix::try_send(&mut payroll.svm, &[pay_ix], signer, &[])
}

/// The admin authorizes an operator: the config PDA records who, until when, and for which vault, and the event says so.
#[test]
fn set_operator_records_the_operator_and_emits_an_event() {
    let mut svm = setup_svm();
    set_clock(&mut svm, NOW);
    let admin = funded_keypair(&mut svm);
    let operator = Keypair::new();
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault = ix::initialize_vault(&mut svm, &admin, mint);

    let expires_at = NOW + 3_600;
    let meta = ix::send(&mut svm, &[ix::build_set_operator_ix(&admin, vault, operator.pubkey(), expires_at, 3)], &admin, &[]);

    let config = operator_config(&svm, vault);
    assert_eq!(config.vault.to_bytes(), vault.to_bytes());
    assert_eq!(config.operator.to_bytes(), operator.pubkey().to_bytes());
    assert_eq!(config.expires_at, expires_at);
    assert_eq!(config.payments_left, 3);
    assert_eq!(config.bump, operator_config_pda(vault).1);

    let event = parse_set_operator_event(&meta);
    assert_eq!(event.vault.to_bytes(), vault.to_bytes());
    assert_eq!(event.admin.to_bytes(), admin.pubkey().to_bytes());
    assert_eq!(event.operator.to_bytes(), operator.pubkey().to_bytes());
    assert_eq!(event.expires_at, expires_at);
    assert_eq!(event.payments_left, 3);
}

/// The whole point: with an operator authorized, the operator alone signs a payment. It works, moves the hidden amount, and the
/// event records that the operator (not the admin) signed.
#[test]
fn an_authorized_operator_can_pay_and_the_event_names_them() {
    let amount = 250_000;
    let mut f = fixture(amount);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);

    let pay_ix = f.payroll.pay_ix(&f.operator, &f.contexts);
    // The operator is the only signer and the fee payer: the admin's wallet takes no part in this transaction.
    let meta = ix::send(&mut f.payroll.svm, &[pay_ix], &f.operator, &[]);

    assert_eq!(
        f.payroll.decrypted_available(f.payroll.treasury_token_account, &f.payroll.admin_keys.ae_key),
        TREASURY_FUNDING - amount,
        "the treasury should be debited the same amount as an admin payment"
    );
    let event = parse_pay_employee_event(&meta);
    assert_eq!(event.signer.to_bytes(), f.operator.pubkey().to_bytes(), "the event should record who signed");
    assert_eq!(event.employee.to_bytes(), f.payroll.employee.pubkey().to_bytes());
}

/// Authorizing an operator doesn't take anything from the admin: they can still pay, and the event says the admin signed.
#[test]
fn the_admin_still_pays_when_an_operator_is_set() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);

    let pay_ix = f.payroll.pay_ix(&f.payroll.admin, &f.contexts);
    let meta = ix::send(&mut f.payroll.svm, &[pay_ix], &f.payroll.admin, &[]);
    assert_eq!(parse_pay_employee_event(&meta).signer.to_bytes(), f.payroll.admin.pubkey().to_bytes());
}

/// REQ03 still holds: a third party is rejected, with or without an operator configured.
#[test]
fn a_signer_who_is_neither_admin_nor_operator_is_rejected() {
    let mut f = fixture(100_000);
    let stranger = funded_keypair(&mut f.payroll.svm);

    // No operator set at all: the config account doesn't exist.
    assert_rejected_with(try_pay(&mut f.payroll, &f.contexts, &stranger), VaultError::Unauthorized);

    // An operator set, but the signer is someone else.
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);
    f.payroll.svm.expire_blockhash();
    assert_rejected_with(try_pay(&mut f.payroll, &f.contexts, &stranger), VaultError::Unauthorized);
}

/// Revoking (setting the default key) stops the operator immediately, and the stored expiry is cleared.
#[test]
fn revoking_the_operator_stops_it_paying() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 500, 5);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, Address::default(), NOW + 500, 5);

    let config = operator_config(&f.payroll.svm, f.payroll.vault);
    assert_eq!(config.operator.to_bytes(), [0u8; 32], "the operator should be cleared");
    assert_eq!(config.expires_at, 0, "revoking must not leave a stale expiry behind");
    assert_eq!(config.payments_left, 0, "revoking must not leave payments behind");

    assert_rejected_with(try_pay(&mut f.payroll, &f.contexts, &f.operator), VaultError::Unauthorized);
}

/// An operator authorization can carry an expiry. Past it the operator is rejected with `OperatorExpired`, and the admin can
/// extend it by setting it again.
#[test]
fn an_expired_operator_is_rejected_and_the_admin_can_extend_it() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 100, 5);

    set_clock(&mut f.payroll.svm, NOW + 200);
    assert_rejected_with(try_pay(&mut f.payroll, &f.contexts, &f.operator), VaultError::OperatorExpired);

    // The admin extends it. The very same proofs still work: the failed attempt consumed nothing.
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 10_000, 5);
    f.payroll.svm.expire_blockhash();
    let pay_ix = f.payroll.pay_ix(&f.operator, &f.contexts);
    ix::send(&mut f.payroll.svm, &[pay_ix], &f.operator, &[]);
}

/// A real operator needs a short, bounded authorization: no expiry (0), one beyond 24 hours, or zero payments are all refused.
#[test]
fn set_operator_rejects_no_expiry_a_long_ttl_and_a_zero_limit() {
    let mut svm = setup_svm();
    set_clock(&mut svm, NOW);
    let admin = funded_keypair(&mut svm);
    let operator = Keypair::new();
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault = ix::initialize_vault(&mut svm, &admin, mint);
    let code = |e: VaultError| TransactionError::InstructionError(0, InstructionError::Custom(ERROR_CODE_OFFSET + e as u32));

    for (expires_at, limit, expected) in [
        (0, 5, VaultError::InvalidOperatorExpiry),
        (NOW + 24 * 3_600 + 1, 5, VaultError::InvalidOperatorExpiry),
        (NOW + 3_600, 0, VaultError::InvalidOperatorLimit),
    ] {
        svm.expire_blockhash();
        let result = ix::try_send(&mut svm, &[ix::build_set_operator_ix(&admin, vault, operator.pubkey(), expires_at, limit)], &admin, &[]);
        assert_eq!(result.expect_err("must be refused").err, code(expected));
    }

    // Exactly 24 hours is allowed.
    svm.expire_blockhash();
    ix::set_operator(&mut svm, &admin, vault, operator.pubkey(), NOW + 24 * 3_600, 1);
}

/// The count cap: an operator authorized for N payments can make N, and the next is refused. Only the operator's payments count:
/// the admin's own don't use them up. Authorizing again resets the count.
#[test]
fn the_operator_stops_after_its_payment_limit() {
    let amount = 100_000;
    let mut f = fixture(amount);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 2);

    // The admin pays once: it must not use an operator payment.
    let pay_ix = f.payroll.pay_ix(&f.payroll.admin, &f.contexts);
    ix::send(&mut f.payroll.svm, &[pay_ix], &f.payroll.admin, &[]);
    assert_eq!(operator_config(&f.payroll.svm, f.payroll.vault).payments_left, 2);

    // The operator makes its two payments.
    for left in [1, 0] {
        f.payroll.svm.expire_blockhash();
        let contexts = f.payroll.proofs_for(amount);
        let pay_ix = f.payroll.pay_ix(&f.operator, &contexts);
        ix::send(&mut f.payroll.svm, &[pay_ix], &f.operator, &[]);
        assert_eq!(operator_config(&f.payroll.svm, f.payroll.vault).payments_left, left);
    }

    // The third is refused, and the refusal moves nothing.
    f.payroll.svm.expire_blockhash();
    let contexts = f.payroll.proofs_for(amount);
    assert_rejected_with(try_pay(&mut f.payroll, &contexts, &f.operator), VaultError::OperatorLimitReached);
    assert_eq!(f.payroll.decrypted_available(f.payroll.treasury_token_account, &f.payroll.admin_keys.ae_key), TREASURY_FUNDING - 3 * amount);

    // The admin authorizes again: the count is back, and the same proofs now work.
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 1);
    f.payroll.svm.expire_blockhash();
    let pay_ix = f.payroll.pay_ix(&f.operator, &contexts);
    ix::send(&mut f.payroll.svm, &[pay_ix], &f.operator, &[]);
    assert_eq!(operator_config(&f.payroll.svm, f.payroll.vault).payments_left, 0);
}

/// A real operator can't be given an expiry that is already in the past (that would be a silent no-op), but revoking with any
/// values is fine.
#[test]
fn set_operator_rejects_an_expiry_in_the_past() {
    let mut svm = setup_svm();
    set_clock(&mut svm, NOW);
    let admin = funded_keypair(&mut svm);
    let operator = Keypair::new();
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault = ix::initialize_vault(&mut svm, &admin, mint);

    let result = ix::try_send(&mut svm, &[ix::build_set_operator_ix(&admin, vault, operator.pubkey(), NOW - 1, 5)], &admin, &[]);
    assert_eq!(
        result.expect_err("a past expiry must be rejected").err,
        TransactionError::InstructionError(0, InstructionError::Custom(ERROR_CODE_OFFSET + VaultError::InvalidOperatorExpiry as u32)),
    );

    // Revoking never needs a valid expiry.
    svm.expire_blockhash();
    ix::set_operator(&mut svm, &admin, vault, Address::default(), NOW - 1, 0);
}

/// Only the admin controls who the operator is. Not a stranger, and not the operator itself (it can't extend its own authority).
#[test]
fn only_the_admin_can_set_the_operator() {
    let mut f = fixture(100_000);
    let stranger = funded_keypair(&mut f.payroll.svm);
    let unauthorized = TransactionError::InstructionError(0, InstructionError::Custom(ERROR_CODE_OFFSET + VaultError::Unauthorized as u32));

    let attempt = ix::build_set_operator_ix(&stranger, f.payroll.vault, stranger.pubkey(), NOW + 3_600, 10);
    assert_eq!(ix::try_send(&mut f.payroll.svm, &[attempt], &stranger, &[]).expect_err("a stranger must not set it").err, unauthorized);

    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);
    f.payroll.svm.expire_blockhash();
    let attempt = ix::build_set_operator_ix(&f.operator, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);
    assert_eq!(ix::try_send(&mut f.payroll.svm, &[attempt], &f.operator, &[]).expect_err("the operator must not set itself").err, unauthorized);
}

/// The operator's power is exactly "pay". It can't pause or resume payroll.
#[test]
fn the_operator_cannot_pause_or_resume_payroll() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);
    let unauthorized = TransactionError::InstructionError(0, InstructionError::Custom(ERROR_CODE_OFFSET + VaultError::Unauthorized as u32));

    let pause = ix::build_pause_payroll_ix(&f.operator, f.payroll.vault);
    assert_eq!(ix::try_send(&mut f.payroll.svm, &[pause], &f.operator, &[]).expect_err("the operator must not pause").err, unauthorized);

    ix::pause_payroll(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault);
    f.payroll.svm.expire_blockhash();
    let resume = ix::build_resume_payroll_ix(&f.operator, f.payroll.vault);
    assert_eq!(ix::try_send(&mut f.payroll.svm, &[resume], &f.operator, &[]).expect_err("the operator must not resume").err, unauthorized);
}

/// REQ02 applies to the operator too: the admin's pause is a real stop.
#[test]
fn a_paused_vault_blocks_the_operator() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);
    ix::pause_payroll(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault);

    assert_rejected_with(try_pay(&mut f.payroll, &f.contexts, &f.operator), VaultError::PayrollPaused);
}

/// An operator authorization belongs to one vault. Presenting some other vault's config PDA is refused by the seeds check,
/// so an operator of one company can't be passed off as the operator of another.
#[test]
fn an_operator_config_from_another_vault_is_refused() {
    let mut f = fixture(100_000);
    ix::set_operator(&mut f.payroll.svm, &f.payroll.admin, f.payroll.vault, f.operator.pubkey(), NOW + 3_600, 10);

    let mut pay_ix = f.payroll.pay_ix(&f.operator, &f.contexts);
    let other_vault = Address::new_unique();
    let last = pay_ix.accounts.len() - 1;
    pay_ix.accounts[last].pubkey = operator_config_pda(other_vault).0;

    let result = ix::try_send(&mut f.payroll.svm, &[pay_ix], &f.operator, &[]);
    let failure = result.expect_err("a config for a different vault must be refused");
    assert_eq!(
        failure.err,
        TransactionError::InstructionError(0, InstructionError::Custom(anchor_lang::error::ErrorCode::ConstraintSeeds as u32)),
        "logs: {:?}",
        failure.meta.logs
    );
}
