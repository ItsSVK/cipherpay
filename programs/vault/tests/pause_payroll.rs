mod common;

use anchor_lang::{error::ERROR_CODE_OFFSET, AccountDeserialize};
use common::{
    env::{funded_keypair, setup_svm},
    ix, mint,
};
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::TransactionError;
use vault::{error::VaultError, Vault};

fn paused(svm: &litesvm::LiteSVM, vault: solana_address::Address) -> bool {
    let account = svm.get_account(&vault).expect("vault should exist");
    Vault::try_deserialize(&mut account.data.as_slice())
        .expect("vault should deserialize")
        .paused
}

/// UC3 (REQ11) and REQ12: the authority flips `Vault.paused` to true and back.
#[test]
fn pause_and_resume_payroll_flip_the_paused_flag() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault = ix::initialize_vault(&mut svm, &admin, mint);

    assert!(!paused(&svm, vault), "a new vault starts unpaused");

    ix::pause_payroll(&mut svm, &admin, vault);
    assert!(paused(&svm, vault));

    ix::resume_payroll(&mut svm, &admin, vault);
    assert!(!paused(&svm, vault));
}

/// REQ11/REQ12: a signer who isn't `Vault.authority` can neither pause nor
/// resume, and the flag stays untouched.
#[test]
fn pause_and_resume_payroll_reject_a_non_authority_signer() {
    let mut svm = setup_svm();
    let admin = funded_keypair(&mut svm);
    let impostor = funded_keypair(&mut svm);
    let mint = mint::create_confidential_mint(&mut svm, &admin, &Keypair::new(), 6, admin.pubkey());
    let vault = ix::initialize_vault(&mut svm, &admin, mint);
    let unauthorized = TransactionError::InstructionError(
        0,
        InstructionError::Custom(ERROR_CODE_OFFSET + VaultError::Unauthorized as u32),
    );

    let result = ix::try_send(&mut svm, &[ix::build_pause_payroll_ix(&impostor, vault)], &impostor, &[]);
    assert_eq!(result.expect_err("impostor must not pause").err, unauthorized);
    assert!(!paused(&svm, vault));

    ix::pause_payroll(&mut svm, &admin, vault);
    let result = ix::try_send(&mut svm, &[ix::build_resume_payroll_ix(&impostor, vault)], &impostor, &[]);
    assert_eq!(result.expect_err("impostor must not resume").err, unauthorized);
    assert!(paused(&svm, vault), "the impostor's failed resume must not change the flag");
}
