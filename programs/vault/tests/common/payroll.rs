//! A ready-made payroll for tests: a vault whose encrypted treasury is funded, a mint with a real auditor key, and one
//! activated (wallet-owned) employee account. Shared by the `pay_employee` and operator test suites.

use anchor_lang::{error::ERROR_CODE_OFFSET, AnchorDeserialize, Discriminator};
use base64::Engine;
use litesvm::{types::TransactionMetadata, LiteSVM};
use solana_address::Address;
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::TransactionError;
use solana_zk_sdk::encryption::auth_encryption::AeCiphertext;
use vault::{error::VaultError, PayEmployeeEvent};

use crate::common::{
    confidential_proof::{setup_transfer_proof_contexts, TransferProofContexts},
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    token_state::{available_balance, decryptable_available_balance},
    zk::ConfidentialKeys,
};

pub const TREASURY_FUNDING: u64 = 1_000_000;

/// A vault whose encrypted treasury is funded, a mint with a real auditor key,
/// and one activated (wallet-owned) employee account.
pub struct Payroll {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub admin_keys: ConfidentialKeys,
    pub auditor: ConfidentialKeys,
    pub employee: Keypair,
    pub employee_keys: ConfidentialKeys,
    pub vault: Address,
    pub mint: Address,
    pub treasury_token_account: Address,
    pub employee_token_account: Address,
}

pub fn token_program() -> Address {
    spl_token_2022_interface::ID
}

pub fn setup_payroll() -> Payroll {
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
    pub fn proofs_for(&mut self, amount: u64) -> TransferProofContexts {
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

    pub fn pay_ix(&self, signer: &Keypair, contexts: &TransferProofContexts) -> solana_instruction::Instruction {
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

    pub fn decrypted_available(&self, token_account: Address, ae_key: &solana_zk_sdk::encryption::auth_encryption::AeKey) -> u64 {
        let account = self.svm.get_account(&token_account).unwrap();
        AeCiphertext::from_bytes(&decryptable_available_balance(&account.data))
            .expect("failed to parse decryptable balance")
            .decrypt(ae_key)
            .expect("failed to decrypt balance")
    }
}

pub fn custom_error_code(error: VaultError) -> u32 {
    ERROR_CODE_OFFSET + error as u32
}

pub fn assert_rejected_with(
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

pub fn parse_pay_employee_event(meta: &TransactionMetadata) -> PayEmployeeEvent {
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
