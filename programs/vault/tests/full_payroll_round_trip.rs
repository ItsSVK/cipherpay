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
use spl_token_2022_interface::extension::confidential_transfer::instruction::apply_pending_balance;

fn decrypted_available_balance(data: &[u8], keys: &ConfidentialKeys) -> u64 {
    AeCiphertext::from_bytes(&decryptable_available_balance(data))
        .expect("failed to parse decryptable balance")
        .decrypt(&keys.ae_key)
        .expect("failed to decrypt available balance")
}

/// The whole payroll pipeline in one test, not just pairwise: the employer
/// wraps a real asset, funds the encrypted treasury, pays an employee with
/// `pay_employee`, and the employee discloses part of it (`withdraw_confidential`)
/// and unwraps it back into the real asset. The final real-asset balances are
/// asserted at the end.
///
/// The vault's mint is the wrapped mint `token_wrap_compliance` creates, so
/// it carries a real auditor key and every transfer proof must be built
/// against it (this once caught an "ElGamal public key mismatch" that no
/// pairwise test surfaced).
#[test]
fn wrap_fund_pay_withdraw_unwrap_round_trip() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let admin = funded_keypair(&mut svm);
    let employee = funded_keypair(&mut svm);

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

    // The employer holds 1,000,000 units of the real asset (e.g. USDC).
    let admin_unwrapped_account = mint::create_and_fund_associated_token_account(
        &mut svm,
        &admin,
        unwrapped_mint,
        &mint_authority,
        admin.pubkey(),
        unwrapped_token_program,
        1_000_000,
    );

    token_wrap::create_wrapped_mint(&mut svm, &admin, unwrapped_mint, wrapped_token_program);
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);

    // Vault setup: the vault's mint is the wrapped mint; the treasury is a
    // vault-PDA-owned account whose balance only the admin's keys can read.
    let vault = ix::initialize_vault(&mut svm, &admin, wrapped_mint);
    let admin_keys = ConfidentialKeys::new_rand();
    let treasury_token_account = ix::configure_treasury_account(
        &mut svm,
        &admin,
        vault,
        wrapped_mint,
        wrapped_token_program,
        associated_token_program,
        &admin_keys,
    );

    // Fund the treasury: wrap -> fund_treasury (public) -> deposit_confidential
    // (pending) -> apply_treasury_pending (available).
    let wrap_amount: u64 = 1_000_000;
    let admin_wrapped_account = ix::wrap_confidential(
        &mut svm,
        &admin,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        wrap_amount,
    );
    ix::fund_treasury(
        &mut svm,
        &admin,
        admin_wrapped_account,
        vault,
        wrapped_mint,
        treasury_token_account,
        wrapped_token_program,
        wrap_amount,
    );
    ix::deposit_confidential(
        &mut svm,
        &admin,
        vault,
        wrapped_mint,
        treasury_token_account,
        wrapped_token_program,
        wrap_amount,
    );
    ix::apply_treasury_pending(
        &mut svm,
        &admin,
        vault,
        treasury_token_account,
        wrapped_token_program,
        1,
        admin_keys.ae_key.encrypt(wrap_amount).to_bytes(),
    );

    // The employee activates their own wallet-owned confidential account.
    let employee_keys = ConfidentialKeys::new_rand();
    let employee_wrapped_account = ix::create_confidential_account(
        &mut svm,
        &employee,
        wrapped_mint,
        wrapped_token_program,
        associated_token_program,
        &employee_keys,
    );

    // The employer pays the employee: the amount is hidden on-chain.
    let pay_amount: u64 = 400_000;
    let treasury_data = svm.get_account(&treasury_token_account).unwrap();
    let pay_contexts = setup_transfer_proof_contexts(
        &mut svm,
        &admin,
        available_balance(&treasury_data.data),
        decryptable_available_balance(&treasury_data.data),
        pay_amount,
        &admin_keys.elgamal,
        &admin_keys.ae_key,
        employee_keys.elgamal.pubkey(),
        Some(&compliance_auditor_elgamal_pubkey()),
    );
    let pay_ix = ix::build_pay_employee_ix(
        &admin,
        vault,
        wrapped_mint,
        treasury_token_account,
        employee_wrapped_account,
        pay_contexts.equality_context,
        pay_contexts.ciphertext_validity_context,
        pay_contexts.range_context,
        wrapped_token_program,
        pay_contexts.new_source_decryptable_available_balance,
        pay_contexts.transfer_amount_auditor_ciphertext_lo,
        pay_contexts.transfer_amount_auditor_ciphertext_hi,
    );
    ix::send(&mut svm, &[pay_ix], &admin, &[]);

    // The employee applies their pending balance (the payment credited
    // pending, not available).
    let employee_apply_pending_ix = apply_pending_balance(
        &wrapped_token_program,
        &employee_wrapped_account,
        1,
        &PodAeCiphertext(employee_keys.ae_key.encrypt(pay_amount).to_bytes()),
        &employee.pubkey(),
        &[],
    )
    .expect("failed to build ApplyPendingBalance instruction");
    ix::send(&mut svm, &[employee_apply_pending_ix], &employee, &[]);

    // The employee discloses part of their pay: confidential -> public.
    let withdraw_amount: u64 = 250_000;
    let employee_data = svm.get_account(&employee_wrapped_account).unwrap();
    let withdraw_contexts = setup_withdraw_proof_contexts(
        &mut svm,
        &employee,
        available_balance(&employee_data.data),
        decryptable_available_balance(&employee_data.data),
        withdraw_amount,
        &employee_keys.elgamal,
        &employee_keys.ae_key,
    );
    ix::withdraw_confidential(
        &mut svm,
        &employee,
        wrapped_mint,
        employee_wrapped_account,
        withdraw_contexts.equality_context,
        withdraw_contexts.range_context,
        wrapped_token_program,
        withdraw_amount,
        withdraw_contexts.new_decryptable_available_balance,
    );

    // ...and unwraps what they disclosed back into the real asset.
    let employee_unwrapped_account = ix::unwrap_confidential(
        &mut svm,
        &employee,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        withdraw_amount,
    );

    // The real asset moved end to end.
    let employee_unwrapped_data = svm.get_account(&employee_unwrapped_account).unwrap();
    assert_eq!(
        base_amount(&employee_unwrapped_data.data),
        withdraw_amount,
        "the real asset should have moved from the employer's deposit to the employee's account"
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
        "escrow should keep the real asset backing everything still wrapped"
    );

    let employee_wrapped_data = svm.get_account(&employee_wrapped_account).unwrap();
    assert_eq!(
        base_amount(&employee_wrapped_data.data),
        0,
        "the employee unwrapped everything they withdrew"
    );

    // Confidential balances, decrypted with each party's own key.
    assert_eq!(
        decrypted_available_balance(
            &svm.get_account(&treasury_token_account).unwrap().data,
            &admin_keys
        ),
        wrap_amount - pay_amount,
        "the treasury should be debited the hidden payment"
    );
    assert_eq!(
        decrypted_available_balance(
            &svm.get_account(&employee_wrapped_account).unwrap().data,
            &employee_keys
        ),
        pay_amount - withdraw_amount,
        "the employee's remaining confidential balance is the payment minus what they disclosed"
    );

    // The employer's real-asset account was debited by the full wrap amount
    // and never got any of it back.
    let admin_unwrapped_data = svm.get_account(&admin_unwrapped_account).unwrap();
    assert_eq!(
        base_amount(&admin_unwrapped_data.data),
        1_000_000 - wrap_amount
    );
}
