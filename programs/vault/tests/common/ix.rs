//! Builds and sends the vault program's own instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

use crate::common::{
    env::{to_address, to_anchor_pubkey},
    pda::{escrow_address, vault_pda, wrapped_mint_authority_pda, wrapped_mint_pda},
    zk::ConfidentialKeys,
};

/// Signs `instructions` with `payer` plus `extra_signers` and sends the
/// transaction, returning the failure instead of panicking -- for tests that
/// assert an instruction is rejected.
pub fn try_send(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> Result<TransactionMetadata, FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);

    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);

    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &signers)
        .expect("failed to sign transaction");

    svm.send_transaction(tx)
}

/// Like [`try_send`], but panics (with the simulation logs) if it fails.
pub fn send(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> TransactionMetadata {
    try_send(svm, instructions, payer, extra_signers).expect("vault instruction failed")
}

/// Builds the `initialize_vault` instruction. Returns it alongside the vault PDA
/// it will create, so callers don't have to re-derive it.
pub fn build_initialize_vault_ix(admin: &Keypair, mint: Address) -> (Instruction, Address) {
    let admin_address = admin.pubkey();
    let (vault, _bump) = vault_pda(admin_address, mint);

    let accounts = vault::accounts::InitializeVault {
        admin: to_anchor_pubkey(admin_address),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    let ix = Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::InitializeVault {}.data(),
    };

    (ix, vault)
}

/// Sends `initialize_vault` and returns the vault PDA it created.
pub fn initialize_vault(svm: &mut LiteSVM, admin: &Keypair, mint: Address) -> Address {
    let (ix, vault) = build_initialize_vault_ix(admin, mint);
    send(svm, &[ix], admin, &[]);
    vault
}

/// Builds the two-instruction sequence `create_confidential_account` needs
/// -- the P2P-transfer primitive: no `Vault`, just
/// `owner`'s own confidential token account for `mint`. Returns the
/// instructions alongside the token account address the caller will likely
/// want to assert against.
pub fn build_create_confidential_account_ixs(
    owner: &Keypair,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> (Vec<Instruction>, Address) {
    let owner_address = owner.pubkey();
    let token_account = anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &to_anchor_pubkey(owner_address),
        &to_anchor_pubkey(mint),
        &to_anchor_pubkey(token_program),
    );
    let token_account = to_address(token_account);

    let accounts = vault::accounts::CreateConfidentialAccount {
        owner: to_anchor_pubkey(owner_address),
        mint: to_anchor_pubkey(mint),
        token_account: to_anchor_pubkey(token_account),
        instructions_sysvar: to_anchor_pubkey(solana_instructions_sysvar::ID),
        associated_token_program: to_anchor_pubkey(associated_token_program),
        token_program: to_anchor_pubkey(token_program),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    let create_confidential_account_ix = Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::CreateConfidentialAccount {
            elgamal_pubkey: keys.elgamal_pubkey_bytes(),
            decryptable_zero_balance: keys.decryptable_zero_balance(),
        }
        .data(),
    };

    let ixs = vec![
        keys.verify_pubkey_validity_instruction(),
        create_confidential_account_ix,
    ];

    (ixs, token_account)
}

/// Sends the `VerifyPubkeyValidity` + `create_confidential_account`
/// sequence and returns the token account address.
pub fn create_confidential_account(
    svm: &mut LiteSVM,
    owner: &Keypair,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> Address {
    let (ixs, token_account) = build_create_confidential_account_ixs(
        owner,
        mint,
        token_program,
        associated_token_program,
        keys,
    );
    send(svm, &ixs, owner, &[]);
    token_account
}

/// Builds the `VerifyPubkeyValidity` + `configure_treasury_account`
/// sequence. Returns the instructions alongside the treasury token account
/// address the caller will likely want to assert against.
pub fn build_configure_treasury_account_ixs(
    admin: &Keypair,
    vault: Address,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> (Vec<Instruction>, Address) {
    let treasury_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &to_anchor_pubkey(vault),
            &to_anchor_pubkey(mint),
            &to_anchor_pubkey(token_program),
        );
    let treasury_token_account = to_address(treasury_token_account);

    let accounts = vault::accounts::ConfigureTreasuryAccount {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        treasury_token_account: to_anchor_pubkey(treasury_token_account),
        instructions_sysvar: to_anchor_pubkey(solana_instructions_sysvar::ID),
        associated_token_program: to_anchor_pubkey(associated_token_program),
        token_program: to_anchor_pubkey(token_program),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    let configure_treasury_account_ix = Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::ConfigureTreasuryAccount {
            elgamal_pubkey: keys.elgamal_pubkey_bytes(),
            decryptable_zero_balance: keys.decryptable_zero_balance(),
        }
        .data(),
    };

    let ixs = vec![
        keys.verify_pubkey_validity_instruction(),
        configure_treasury_account_ix,
    ];

    (ixs, treasury_token_account)
}

/// Sends the `VerifyPubkeyValidity` + `configure_treasury_account` sequence
/// and returns the treasury token account address.
pub fn configure_treasury_account(
    svm: &mut LiteSVM,
    admin: &Keypair,
    vault: Address,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> Address {
    let (ixs, treasury_token_account) = build_configure_treasury_account_ixs(
        admin,
        vault,
        mint,
        token_program,
        associated_token_program,
        keys,
    );
    send(svm, &ixs, admin, &[]);
    treasury_token_account
}

/// Builds the `fund_treasury` instruction: a plain public-balance transfer
/// from `funder_token_account` into the treasury.
pub fn build_fund_treasury_ix(
    funder: &Keypair,
    funder_token_account: Address,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    token_program: Address,
    amount: u64,
) -> Instruction {
    let accounts = vault::accounts::FundTreasury {
        funder: to_anchor_pubkey(funder.pubkey()),
        funder_token_account: to_anchor_pubkey(funder_token_account),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        treasury_token_account: to_anchor_pubkey(treasury_token_account),
        token_program: to_anchor_pubkey(token_program),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::FundTreasury { amount }.data(),
    }
}

/// Sends `fund_treasury`.
#[allow(clippy::too_many_arguments)]
pub fn fund_treasury(
    svm: &mut LiteSVM,
    funder: &Keypair,
    funder_token_account: Address,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    token_program: Address,
    amount: u64,
) {
    let ix = build_fund_treasury_ix(
        funder,
        funder_token_account,
        vault,
        mint,
        treasury_token_account,
        token_program,
        amount,
    );
    send(svm, &[ix], funder, &[]);
}

/// Builds the `deposit_confidential` instruction: moves `amount` from the
/// treasury's public balance into its pending confidential balance.
pub fn build_deposit_confidential_ix(
    admin: &Keypair,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    token_program: Address,
    amount: u64,
) -> Instruction {
    let accounts = vault::accounts::DepositConfidential {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        treasury_token_account: to_anchor_pubkey(treasury_token_account),
        token_program: to_anchor_pubkey(token_program),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::DepositConfidential { amount }.data(),
    }
}

/// Sends `deposit_confidential`.
pub fn deposit_confidential(
    svm: &mut LiteSVM,
    admin: &Keypair,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    token_program: Address,
    amount: u64,
) {
    let ix = build_deposit_confidential_ix(
        admin,
        vault,
        mint,
        treasury_token_account,
        token_program,
        amount,
    );
    send(svm, &[ix], admin, &[]);
}

/// Builds the `apply_treasury_pending` instruction: folds the treasury's
/// pending confidential balance into its available balance.
pub fn build_apply_treasury_pending_ix(
    admin: &Keypair,
    vault: Address,
    treasury_token_account: Address,
    token_program: Address,
    expected_pending_balance_credit_counter: u64,
    new_decryptable_available_balance: [u8; 36],
) -> Instruction {
    let accounts = vault::accounts::ApplyTreasuryPending {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
        treasury_token_account: to_anchor_pubkey(treasury_token_account),
        token_program: to_anchor_pubkey(token_program),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::ApplyTreasuryPending {
            expected_pending_balance_credit_counter,
            new_decryptable_available_balance,
        }
        .data(),
    }
}

/// Sends `apply_treasury_pending`.
pub fn apply_treasury_pending(
    svm: &mut LiteSVM,
    admin: &Keypair,
    vault: Address,
    treasury_token_account: Address,
    token_program: Address,
    expected_pending_balance_credit_counter: u64,
    new_decryptable_available_balance: [u8; 36],
) {
    let ix = build_apply_treasury_pending_ix(
        admin,
        vault,
        treasury_token_account,
        token_program,
        expected_pending_balance_credit_counter,
        new_decryptable_available_balance,
    );
    send(svm, &[ix], admin, &[]);
}

/// Builds the `wrap_confidential` instruction: moves `amount` of a real
/// asset into its wrapped Token-2022 representation via CPI into
/// `token_wrap_compliance`. No `Vault` involved.
#[allow(clippy::too_many_arguments)]
pub fn build_wrap_confidential_ix(
    owner: &Keypair,
    unwrapped_mint: Address,
    unwrapped_token_program: Address,
    wrapped_token_program: Address,
    associated_token_program: Address,
    amount: u64,
) -> Instruction {
    let owner_address = owner.pubkey();
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let (wrapped_mint_authority, _bump) = wrapped_mint_authority_pda(wrapped_mint);
    let escrow = escrow_address(unwrapped_mint, unwrapped_token_program, wrapped_token_program);

    let owner_unwrapped_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &to_anchor_pubkey(owner_address),
            &to_anchor_pubkey(unwrapped_mint),
            &to_anchor_pubkey(unwrapped_token_program),
        );
    let owner_wrapped_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &to_anchor_pubkey(owner_address),
            &to_anchor_pubkey(wrapped_mint),
            &to_anchor_pubkey(wrapped_token_program),
        );

    let accounts = vault::accounts::WrapConfidential {
        owner: to_anchor_pubkey(owner_address),
        unwrapped_mint: to_anchor_pubkey(unwrapped_mint),
        owner_unwrapped_token_account,
        wrapped_mint: to_anchor_pubkey(wrapped_mint),
        wrapped_mint_authority: to_anchor_pubkey(wrapped_mint_authority),
        escrow: to_anchor_pubkey(escrow),
        owner_wrapped_token_account,
        token_wrap_program: vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
        unwrapped_token_program: to_anchor_pubkey(unwrapped_token_program),
        wrapped_token_program: to_anchor_pubkey(wrapped_token_program),
        associated_token_program: to_anchor_pubkey(associated_token_program),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::WrapConfidential { amount }.data(),
    }
}

/// Sends `wrap_confidential`. Returns the caller's own wrapped-mint token
/// account address.
#[allow(clippy::too_many_arguments)]
pub fn wrap_confidential(
    svm: &mut LiteSVM,
    owner: &Keypair,
    unwrapped_mint: Address,
    unwrapped_token_program: Address,
    wrapped_token_program: Address,
    associated_token_program: Address,
    amount: u64,
) -> Address {
    let ix = build_wrap_confidential_ix(
        owner,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        amount,
    );
    send(svm, &[ix], owner, &[]);

    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    to_address(anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &to_anchor_pubkey(owner.pubkey()),
        &to_anchor_pubkey(wrapped_mint),
        &to_anchor_pubkey(wrapped_token_program),
    ))
}

/// Builds the `unwrap_confidential` instruction: reverses `wrap_confidential`.
#[allow(clippy::too_many_arguments)]
pub fn build_unwrap_confidential_ix(
    owner: &Keypair,
    unwrapped_mint: Address,
    unwrapped_token_program: Address,
    wrapped_token_program: Address,
    associated_token_program: Address,
    amount: u64,
) -> Instruction {
    let owner_address = owner.pubkey();
    let (wrapped_mint, _bump) = wrapped_mint_pda(unwrapped_mint, wrapped_token_program);
    let (wrapped_mint_authority, _bump) = wrapped_mint_authority_pda(wrapped_mint);
    let escrow = escrow_address(unwrapped_mint, unwrapped_token_program, wrapped_token_program);

    let owner_unwrapped_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &to_anchor_pubkey(owner_address),
            &to_anchor_pubkey(unwrapped_mint),
            &to_anchor_pubkey(unwrapped_token_program),
        );
    let owner_wrapped_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &to_anchor_pubkey(owner_address),
            &to_anchor_pubkey(wrapped_mint),
            &to_anchor_pubkey(wrapped_token_program),
        );

    let accounts = vault::accounts::UnwrapConfidential {
        owner: to_anchor_pubkey(owner_address),
        unwrapped_mint: to_anchor_pubkey(unwrapped_mint),
        owner_unwrapped_token_account,
        wrapped_mint: to_anchor_pubkey(wrapped_mint),
        wrapped_mint_authority: to_anchor_pubkey(wrapped_mint_authority),
        escrow: to_anchor_pubkey(escrow),
        owner_wrapped_token_account,
        token_wrap_program: vault::TOKEN_WRAP_COMPLIANCE_PROGRAM_ID,
        unwrapped_token_program: to_anchor_pubkey(unwrapped_token_program),
        wrapped_token_program: to_anchor_pubkey(wrapped_token_program),
        associated_token_program: to_anchor_pubkey(associated_token_program),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::UnwrapConfidential { amount }.data(),
    }
}

/// Builds the `withdraw_confidential` instruction, referencing two
/// already-populated proof context-state accounts (see
/// `confidential_proof::setup_withdraw_proof_contexts`).
pub fn build_withdraw_confidential_ix(
    owner: &Keypair,
    mint: Address,
    token_account: Address,
    equality_proof_context: Address,
    range_proof_context: Address,
    token_program: Address,
    amount: u64,
    new_decryptable_available_balance: [u8; 36],
) -> Instruction {
    let accounts = vault::accounts::WithdrawConfidential {
        owner: to_anchor_pubkey(owner.pubkey()),
        mint: to_anchor_pubkey(mint),
        token_account: to_anchor_pubkey(token_account),
        equality_proof_context: to_anchor_pubkey(equality_proof_context),
        range_proof_context: to_anchor_pubkey(range_proof_context),
        token_program: to_anchor_pubkey(token_program),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::WithdrawConfidential {
            amount,
            new_decryptable_available_balance,
        }
        .data(),
    }
}

/// Sends `withdraw_confidential`.
#[allow(clippy::too_many_arguments)]
pub fn withdraw_confidential(
    svm: &mut LiteSVM,
    owner: &Keypair,
    mint: Address,
    token_account: Address,
    equality_proof_context: Address,
    range_proof_context: Address,
    token_program: Address,
    amount: u64,
    new_decryptable_available_balance: [u8; 36],
) {
    let ix = build_withdraw_confidential_ix(
        owner,
        mint,
        token_account,
        equality_proof_context,
        range_proof_context,
        token_program,
        amount,
        new_decryptable_available_balance,
    );
    send(svm, &[ix], owner, &[]);
}

/// Sends `unwrap_confidential`. Returns the caller's own unwrapped-mint
/// token account address.
#[allow(clippy::too_many_arguments)]
pub fn unwrap_confidential(
    svm: &mut LiteSVM,
    owner: &Keypair,
    unwrapped_mint: Address,
    unwrapped_token_program: Address,
    wrapped_token_program: Address,
    associated_token_program: Address,
    amount: u64,
) -> Address {
    let ix = build_unwrap_confidential_ix(
        owner,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        amount,
    );
    send(svm, &[ix], owner, &[]);

    to_address(anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &to_anchor_pubkey(owner.pubkey()),
        &to_anchor_pubkey(unwrapped_mint),
        &to_anchor_pubkey(unwrapped_token_program),
    ))
}

/// Builds the `pay_employee` instruction, referencing three already-populated
/// proof context-state accounts (see
/// `confidential_proof::setup_transfer_proof_contexts`).
#[allow(clippy::too_many_arguments)]
pub fn build_pay_employee_ix(
    admin: &Keypair,
    vault: Address,
    mint: Address,
    treasury_token_account: Address,
    employee_token_account: Address,
    equality_proof_context: Address,
    ciphertext_validity_proof_context: Address,
    range_proof_context: Address,
    token_program: Address,
    new_source_decryptable_available_balance: [u8; 36],
    transfer_amount_auditor_ciphertext_lo: [u8; 64],
    transfer_amount_auditor_ciphertext_hi: [u8; 64],
) -> Instruction {
    let accounts = vault::accounts::PayEmployee {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        treasury_token_account: to_anchor_pubkey(treasury_token_account),
        employee_token_account: to_anchor_pubkey(employee_token_account),
        equality_proof_context: to_anchor_pubkey(equality_proof_context),
        ciphertext_validity_proof_context: to_anchor_pubkey(ciphertext_validity_proof_context),
        range_proof_context: to_anchor_pubkey(range_proof_context),
        token_program: to_anchor_pubkey(token_program),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::PayEmployee {
            new_source_decryptable_available_balance,
            transfer_amount_auditor_ciphertext_lo,
            transfer_amount_auditor_ciphertext_hi,
        }
        .data(),
    }
}

/// Builds the `pause_payroll` instruction.
pub fn build_pause_payroll_ix(admin: &Keypair, vault: Address) -> Instruction {
    let accounts = vault::accounts::PausePayroll {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::PausePayroll {}.data(),
    }
}

/// Sends `pause_payroll`.
pub fn pause_payroll(svm: &mut LiteSVM, admin: &Keypair, vault: Address) {
    send(svm, &[build_pause_payroll_ix(admin, vault)], admin, &[]);
}

/// Builds the `resume_payroll` instruction.
pub fn build_resume_payroll_ix(admin: &Keypair, vault: Address) -> Instruction {
    let accounts = vault::accounts::ResumePayroll {
        admin: to_anchor_pubkey(admin.pubkey()),
        vault: to_anchor_pubkey(vault),
    }
    .to_account_metas(None);

    Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::ResumePayroll {}.data(),
    }
}

/// Sends `resume_payroll`.
pub fn resume_payroll(svm: &mut LiteSVM, admin: &Keypair, vault: Address) {
    send(svm, &[build_resume_payroll_ix(admin, vault)], admin, &[]);
}
