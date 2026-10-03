mod common;

use anchor_lang::{error::ERROR_CODE_OFFSET, AnchorDeserialize, Discriminator};
use base64::Engine;
use common::{
    confidential_proof::{setup_transfer_proof_contexts, TransferProofContexts},
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    token_state::{available_balance, decryptable_available_balance},
    zk::ConfidentialKeys,
};
use litesvm::{types::TransactionMetadata, LiteSVM};
use solana_address::Address;
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::TransactionError;
use solana_zk_sdk::encryption::{
    auth_encryption::AeCiphertext, elgamal::ElGamalCiphertext,
};
use solana_zk_sdk_pod::encryption::auth_encryption::PodAeCiphertext;
use spl_token_2022_interface::extension::confidential_transfer::instruction::apply_pending_balance;
use vault::{error::VaultError, PayEmployeeEvent};

const TREASURY_FUNDING: u64 = 1_000_000;

/// A vault whose encrypted treasury is funded, a mint with a real auditor key,
/// and one activated (wallet-owned) employee account.
struct Payroll {
    svm: LiteSVM,
    admin: Keypair,
    admin_keys: ConfidentialKeys,
    auditor: ConfidentialKeys,
    employee: Keypair,
    employee_keys: ConfidentialKeys,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    employee_token_account: Address,
}

fn token_program() -> Address {
    spl_token_2022_interface::ID
}

fn setup_payroll() -> Payroll {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let funder = funded_keypair(&mut svm);
    let employee = funded_keypair(&mut svm);
    let auditor = ConfidentialKeys::new_rand();
    let admin_keys = ConfidentialKeys::new_rand();
    let employee_keys = ConfidentialKeys::new_rand();
    let associated_token_program = to_address(anchor_spl::associated_token::ID);

    // The mint registers a real auditor, like a `token_wrap_compliance` mint,
    // so the transfer proofs must be built against it (REQ06).
    let mint_keypair = Keypair::new();
    let mint = mint::create_confidential_mint_with_auditor(
        &mut svm,
        &admin,
        &mint_keypair,
        6,
        admin.pubkey(),
        Some(auditor.elgamal.pubkey()),
    );
    let vault = ix::initialize_vault(&mut svm, &admin, mint);
    let treasury_token_account = ix::configure_treasury_account(
        &mut svm,
        &admin,
        vault,
        mint,
        token_program(),
        associated_token_program,
        &admin_keys,
    );

    let funder_token_account = mint::create_and_fund_token_account(
        &mut svm,
        &funder,
        mint,
        &admin,
        &Keypair::new(),
        funder.pubkey(),
        TREASURY_FUNDING,
    );
    ix::fund_treasury(
        &mut svm,
        &funder,
        funder_token_account,
        vault,
        mint,
        treasury_token_account,
        token_program(),
        TREASURY_FUNDING,
    );
    ix::deposit_confidential(
        &mut svm,
        &admin,
        vault,
        mint,
        treasury_token_account,
        token_program(),
        TREASURY_FUNDING,
    );
    ix::apply_treasury_pending(
        &mut svm,
        &admin,
        vault,
        treasury_token_account,
        token_program(),
        1,
        admin_keys.ae_key.encrypt(TREASURY_FUNDING).to_bytes(),
    );

    let employee_token_account = ix::create_confidential_account(
        &mut svm,
        &employee,
        mint,
        token_program(),
        associated_token_program,
        &employee_keys,
    );

    Payroll {
        svm,
        admin,
        admin_keys,
        auditor,
        employee,
        employee_keys,
        vault,
        mint,
        treasury_token_account,
        employee_token_account,
    }
}

impl Payroll {
    /// Generates the three transfer proofs for paying `amount` out of the
    /// treasury's current balance.
    fn proofs_for(&mut self, amount: u64) -> TransferProofContexts {
        let treasury = self.svm.get_account(&self.treasury_token_account).unwrap();
        setup_transfer_proof_contexts(
            &mut self.svm,
            &self.admin,
            available_balance(&treasury.data),
            decryptable_available_balance(&treasury.data),
            amount,
            &self.admin_keys.elgamal,
            &self.admin_keys.ae_key,
            self.employee_keys.elgamal.pubkey(),
            Some(self.auditor.elgamal.pubkey()),
        )
    }

    fn pay_ix(&self, signer: &Keypair, contexts: &TransferProofContexts) -> solana_instruction::Instruction {
        ix::build_pay_employee_ix(
            signer,
            self.vault,
            self.mint,
            self.treasury_token_account,
            self.employee_token_account,
            contexts.equality_context,
            contexts.ciphertext_validity_context,
            contexts.range_context,
            token_program(),
            contexts.new_source_decryptable_available_balance,
            contexts.transfer_amount_auditor_ciphertext_lo,
            contexts.transfer_amount_auditor_ciphertext_hi,
        )
    }

    fn decrypted_available(&self, token_account: Address, ae_key: &solana_zk_sdk::encryption::auth_encryption::AeKey) -> u64 {
        let account = self.svm.get_account(&token_account).unwrap();
        AeCiphertext::from_bytes(&decryptable_available_balance(&account.data))
            .expect("failed to parse decryptable balance")
            .decrypt(ae_key)
            .expect("failed to decrypt balance")
    }
}

fn custom_error_code(error: VaultError) -> u32 {
    ERROR_CODE_OFFSET + error as u32
}

fn assert_rejected_with(
    result: Result<TransactionMetadata, litesvm::types::FailedTransactionMetadata>,
    expected: VaultError,
) {
    match result {
        Ok(_) => panic!("expected {expected:?} but the transaction succeeded"),
        Err(failure) => assert_eq!(
            failure.err,
            TransactionError::InstructionError(0, InstructionError::Custom(custom_error_code(expected))),
            "wrong failure; logs: {:?}",
            failure.meta.logs
        ),
    }
}

fn parse_pay_employee_event(meta: &TransactionMetadata) -> PayEmployeeEvent {
    meta.logs
        .iter()
        .filter_map(|line| line.strip_prefix("Program data: "))
        .filter_map(|b64| base64::engine::general_purpose::STANDARD.decode(b64).ok())
        .find(|bytes| bytes.starts_with(PayEmployeeEvent::DISCRIMINATOR))
        .map(|bytes| {
            PayEmployeeEvent::deserialize(&mut &bytes[PayEmployeeEvent::DISCRIMINATOR.len()..])
                .expect("failed to deserialize PayEmployeeEvent")
        })
        .expect("no PayEmployeeEvent in the transaction logs")
}

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
