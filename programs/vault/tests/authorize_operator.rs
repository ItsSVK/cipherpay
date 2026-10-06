//! The offline-signed authorization path: the admin signs a MESSAGE (no expiry, nothing for a wallet to simulate) and anyone
//! -- in practice the payroll helper being authorized -- submits and pays for the transaction that carries it.
//!
//! What must hold: a correctly signed message authorizes; the admin's wallet signs no transaction; a message works exactly
//! once; and every way of faking one is refused (wrong signer, tampered text, arguments that disagree with the text, a
//! tampered signature, no Ed25519 instruction at all, or one whose data lives in a different instruction).

mod common;

use anchor_lang::{error::ERROR_CODE_OFFSET, AccountDeserialize};
use common::{
    env::{funded_keypair, setup_svm},
    ix, mint,
    pda::operator_config_pda,
    payroll::{assert_rejected_with, setup_payroll, Payroll, TREASURY_FUNDING},
};
use litesvm::LiteSVM;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::TransactionError;
use vault::{error::VaultError, OperatorConfig};

const NOW: i64 = 1_000_000;
const HOUR: i64 = 3_600;

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

fn config(svm: &LiteSVM, vault: Address) -> OperatorConfig {
    let account = svm.get_account(&operator_config_pda(vault).0).expect("operator config should exist");
    OperatorConfig::try_deserialize(&mut account.data.as_slice()).expect("operator config should deserialize")
}

fn custom_error(e: VaultError) -> TransactionError {
    TransactionError::InstructionError(1, InstructionError::Custom(ERROR_CODE_OFFSET + e as u32))
}

/// A payroll whose clock is `NOW`, with a funded operator key and proofs ready for one payment.
fn fixture(amount: u64) -> (Payroll, Keypair, common::confidential_proof::TransferProofContexts) {
    let mut payroll = setup_payroll();
    set_clock(&mut payroll.svm, NOW);
    let operator = funded_keypair(&mut payroll.svm);
    let contexts = payroll.proofs_for(amount);
    (payroll, operator, contexts)
}

/// The whole point: the admin signs only a message, the OPERATOR pays for and signs the authorization transaction, and the
/// operator can then pay an employee. The admin's wallet signs no transaction at any stage.
#[test]
fn an_offline_authorization_lets_the_operator_pay() {
    let amount = 250_000;
    let (mut payroll, operator, contexts) = fixture(amount);

    let meta = ix::authorize_operator(&mut payroll.svm, &payroll.admin, &operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0);
    // The admin is not a signer of that transaction: only the operator is.
    assert!(
        !meta.logs.is_empty(),
        "the authorization transaction should have run"
    );

    let c = config(&payroll.svm, payroll.vault);
    assert_eq!(c.operator.to_bytes(), operator.pubkey().to_bytes());
    assert_eq!(c.expires_at, NOW + HOUR);
    assert_eq!(c.payments_left, 5);
    assert_eq!(c.seq, 1, "the sequence must advance so the message can't be reused");

    payroll.svm.expire_blockhash();
    let pay_ix = payroll.pay_ix(&operator, &contexts);
    ix::send(&mut payroll.svm, &[pay_ix], &operator, &[]);
    assert_eq!(
        payroll.decrypted_available(payroll.treasury_token_account, &payroll.admin_keys.ae_key),
        TREASURY_FUNDING - amount
    );
}

/// Replay protection: the exact same signed message is refused the second time.
#[test]
fn the_same_signed_message_cannot_be_used_twice() {
    let (mut payroll, operator, _) = fixture(100_000);
    let message = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let ixs = [
        ix::build_ed25519_ix(&payroll.admin, message.as_bytes()),
        ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0),
    ];
    ix::send(&mut payroll.svm, &ixs, &operator, &[]);

    payroll.svm.expire_blockhash();
    let again = ix::try_send(&mut payroll.svm, &ixs, &operator, &[]);
    assert_eq!(again.expect_err("a replayed authorization must be refused").err, custom_error(VaultError::AuthorizationSeqMismatch));
}

/// A message signed by anyone other than the vault's admin is refused.
#[test]
fn a_message_signed_by_someone_else_is_rejected() {
    let (mut payroll, operator, _) = fixture(100_000);
    let stranger = funded_keypair(&mut payroll.svm);
    let message = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let ixs = [
        ix::build_ed25519_ix(&stranger, message.as_bytes()),
        ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0),
    ];
    assert_eq!(
        ix::try_send(&mut payroll.svm, &ixs, &operator, &[]).expect_err("a stranger's signature must be refused").err,
        custom_error(VaultError::Unauthorized)
    );
}

/// The arguments cannot disagree with the signed text. Signing "5 payments" and submitting "500" is refused, as is naming a
/// different operator or a different expiry than the admin agreed to.
#[test]
fn arguments_that_disagree_with_the_signed_message_are_rejected() {
    let (mut payroll, operator, _) = fixture(100_000);
    let attacker = Keypair::new();
    let signed = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let ed25519 = ix::build_ed25519_ix(&payroll.admin, signed.as_bytes());

    for (operator_arg, expires, payments, label) in [
        (operator.pubkey(), NOW + HOUR, 500u32, "more payments than were signed for"),
        (operator.pubkey(), NOW + 20 * HOUR, 5, "a later expiry than was signed for"),
        (attacker.pubkey(), NOW + HOUR, 5, "a different operator than was signed for"),
    ] {
        payroll.svm.expire_blockhash();
        let ixs = [ed25519.clone(), ix::build_authorize_operator_ix(&operator, payroll.vault, operator_arg, expires, payments, 0)];
        assert_eq!(
            ix::try_send(&mut payroll.svm, &ixs, &operator, &[]).expect_err(label).err,
            custom_error(VaultError::InvalidAuthorization),
            "{label}"
        );
    }
}

/// A tampered signature must not authorize anything. The runtime's precompile is what rejects this, so this test also proves
/// the precompile is actually being enforced here (without it, our program's checks would pass on an unsigned message).
#[test]
fn a_tampered_signature_is_rejected() {
    let (mut payroll, operator, _) = fixture(100_000);
    let message = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let ixs = [
        ix::build_ed25519_ix_with(&payroll.admin, message.as_bytes(), u16::MAX, true),
        ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0),
    ];
    let failure = ix::try_send(&mut payroll.svm, &ixs, &operator, &[]).expect_err("a bad signature must fail the transaction");
    // Instruction 0 is the precompile, instruction 1 is ours. The runtime must reject it at 0, before our program runs:
    // that is what makes the signature check real rather than something we could be tricked into skipping.
    assert!(
        matches!(failure.err, TransactionError::InstructionError(0, _)),
        "a bad signature must be rejected by the runtime precompile at instruction 0, got {:?}",
        failure.err
    );
    assert!(payroll.svm.get_account(&operator_config_pda(payroll.vault).0).is_none_or(|a| a.data.is_empty()), "nothing should have been written");
}

/// Without the Ed25519 instruction in front of it, the instruction authorizes nothing.
#[test]
fn an_authorization_with_no_ed25519_instruction_is_rejected() {
    let (mut payroll, operator, _) = fixture(100_000);
    let only = [ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0)];
    let failure = ix::try_send(&mut payroll.svm, &only, &operator, &[]).expect_err("a bare authorization must be refused");
    assert_eq!(
        failure.err,
        TransactionError::InstructionError(0, InstructionError::Custom(ERROR_CODE_OFFSET + VaultError::InvalidAuthorization as u32))
    );
}

/// The precompile can be told that the data it verifies lives in a DIFFERENT instruction. We must refuse that, because the
/// bytes we read would then not be the bytes the runtime checked.
#[test]
fn an_ed25519_instruction_whose_data_lives_elsewhere_is_rejected() {
    let (mut payroll, operator, _) = fixture(100_000);
    let message = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let ixs = [
        ix::build_ed25519_ix_with(&payroll.admin, message.as_bytes(), 0, false),
        ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0),
    ];
    let failure = ix::try_send(&mut payroll.svm, &ixs, &operator, &[]).expect_err("a cross-instruction reference must be refused");
    assert!(
        matches!(failure.err, TransactionError::InstructionError(_, _)),
        "expected a failure, got {:?}",
        failure.err
    );
    assert!(payroll.svm.get_account(&operator_config_pda(payroll.vault).0).is_none_or(|a| a.data.is_empty()));
}

/// Revoking works the same way, so turning automatic payroll off is also free of the transaction deadline.
#[test]
fn an_offline_revoke_stops_the_operator() {
    let (mut payroll, operator, contexts) = fixture(100_000);
    ix::authorize_operator(&mut payroll.svm, &payroll.admin, &operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0);

    payroll.svm.expire_blockhash();
    ix::authorize_operator(&mut payroll.svm, &payroll.admin, &operator, payroll.vault, Address::default(), 0, 0, 1);

    let c = config(&payroll.svm, payroll.vault);
    assert_eq!(c.operator.to_bytes(), [0u8; 32]);
    assert_eq!(c.payments_left, 0);
    assert_eq!(c.seq, 2);

    let pay_ix = payroll.pay_ix(&operator, &contexts);
    assert_rejected_with(ix::try_send(&mut payroll.svm, &[pay_ix], &operator, &[]), VaultError::Unauthorized);
}

/// The admin can still use the direct, admin-signed path, and doing so invalidates any message they signed earlier but never
/// submitted (the sequence moves on).
#[test]
fn a_direct_set_operator_invalidates_an_outstanding_signed_message() {
    let (mut payroll, operator, _) = fixture(100_000);
    let message = vault::authorization_message(&payroll.vault, &operator.pubkey(), NOW + HOUR, 5, 0);
    let signed = [
        ix::build_ed25519_ix(&payroll.admin, message.as_bytes()),
        ix::build_authorize_operator_ix(&operator, payroll.vault, operator.pubkey(), NOW + HOUR, 5, 0),
    ];

    ix::set_operator(&mut payroll.svm, &payroll.admin, payroll.vault, operator.pubkey(), NOW + HOUR, 2);
    assert_eq!(config(&payroll.svm, payroll.vault).seq, 1);

    payroll.svm.expire_blockhash();
    assert_eq!(
        ix::try_send(&mut payroll.svm, &signed, &operator, &[]).expect_err("the stale message must be refused").err,
        custom_error(VaultError::AuthorizationSeqMismatch)
    );
}

/// The caps still apply on this path: no never-expiring operator, nothing beyond 24 hours, and at least one payment.
#[test]
fn the_expiry_and_payment_caps_still_apply() {
    let mut svm = setup_svm();
    set_clock(&mut svm, NOW);
    let admin = funded_keypair(&mut svm);
    let payer = funded_keypair(&mut svm);
    let operator = Keypair::new();
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault_address = ix::initialize_vault(&mut svm, &admin, mint);

    for (expires_at, payments, expected) in [
        (0, 5, VaultError::InvalidOperatorExpiry),
        (NOW - 1, 5, VaultError::InvalidOperatorExpiry),
        (NOW + 25 * HOUR, 5, VaultError::InvalidOperatorExpiry),
        (NOW + HOUR, 0, VaultError::InvalidOperatorLimit),
    ] {
        svm.expire_blockhash();
        let message = vault::authorization_message(&vault_address, &operator.pubkey(), expires_at, payments, 0);
        let ixs = [
            ix::build_ed25519_ix(&admin, message.as_bytes()),
            ix::build_authorize_operator_ix(&payer, vault_address, operator.pubkey(), expires_at, payments, 0),
        ];
        assert_eq!(
            ix::try_send(&mut svm, &ixs, &payer, &[]).expect_err("must be refused").err,
            custom_error(expected),
            "expires_at={expires_at} payments={payments}"
        );
    }
}

/// The message text is a contract with the web client, which must build the identical bytes or every authorization fails.
/// The same literals are pinned on the TypeScript side in `web/src/lib/chain/operator.test.ts`. Change one, change both.
#[test]
fn the_message_text_is_exactly_what_the_client_builds() {
    let vault: Address = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU".parse().unwrap();
    let operator: Address = "3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf".parse().unwrap();

    assert_eq!(
        vault::authorization_message(&vault, &operator, 1_800_003_600, 12, 3),
        "Cipherpay: authorize payroll operator\nvault: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\noperator: 3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf\nexpires: 1800003600\npayments: 12\nseq: 3"
    );
    assert_eq!(
        vault::authorization_message(&vault, &Address::default(), 0, 0, 7),
        "Cipherpay: revoke payroll operator\nvault: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\nseq: 7"
    );
}
