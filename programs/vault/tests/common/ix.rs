//! Builds and sends the vault program's own instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::{types::TransactionMetadata, LiteSVM};
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

use crate::common::{
    env::{to_address, to_anchor_pubkey},
    pda::{user_account_pda, vault_pda},
    zk::ConfidentialKeys,
};

/// Signs `instructions` with `payer` plus `extra_signers` and sends the
/// transaction, panicking (with the simulation logs) if it fails.
pub fn send(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> TransactionMetadata {
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);

    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);

    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &signers)
        .expect("failed to sign transaction");

    svm.send_transaction(tx)
        .expect("vault instruction failed")
}

/// Builds the `initialize` instruction. Returns it alongside the vault PDA
/// it will create, so callers don't have to re-derive it.
pub fn build_initialize_ix(admin: &Keypair, mint: Address) -> (Instruction, Address) {
    let admin_address = admin.pubkey();
    let (vault, _bump) = vault_pda(admin_address, mint);

    let accounts = vault::accounts::Initialize {
        admin: to_anchor_pubkey(admin_address),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    let ix = Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::Initialize {}.data(),
    };

    (ix, vault)
}

/// Sends `initialize` and returns the vault PDA it created.
pub fn initialize(svm: &mut LiteSVM, admin: &Keypair, mint: Address) -> Address {
    let (ix, vault) = build_initialize_ix(admin, mint);
    send(svm, &[ix], admin, &[]);
    vault
}

/// Builds the two-instruction sequence `create_user_account` needs: the
/// `VerifyPubkeyValidity` proof, immediately followed by the vault's own
/// `create_user_account` instruction. Returns the instructions alongside the
/// PDAs/addresses the caller will likely want to assert against.
pub fn build_create_user_account_ixs(
    user: &Keypair,
    vault: Address,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> (Vec<Instruction>, Address, Address) {
    let user_address = user.pubkey();
    let (user_account, _bump) = user_account_pda(vault, user_address);
    let user_token_account = anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &to_anchor_pubkey(user_address),
        &to_anchor_pubkey(mint),
        &to_anchor_pubkey(token_program),
    );
    let user_token_account = to_address(user_token_account);

    let accounts = vault::accounts::CreateUserAccount {
        user: to_anchor_pubkey(user_address),
        vault: to_anchor_pubkey(vault),
        mint: to_anchor_pubkey(mint),
        user_account: to_anchor_pubkey(user_account),
        user_token_account: to_anchor_pubkey(user_token_account),
        instructions_sysvar: to_anchor_pubkey(solana_instructions_sysvar::ID),
        associated_token_program: to_anchor_pubkey(associated_token_program),
        token_program: to_anchor_pubkey(token_program),
        system_program: anchor_lang::prelude::Pubkey::default(),
    }
    .to_account_metas(None);

    let create_user_account_ix = Instruction {
        program_id: to_address(vault::ID),
        accounts,
        data: vault::instruction::CreateUserAccount {
            elgamal_pubkey: keys.elgamal_pubkey_bytes(),
            decryptable_zero_balance: keys.decryptable_zero_balance(),
        }
        .data(),
    };

    let ixs = vec![
        keys.verify_pubkey_validity_instruction(),
        create_user_account_ix,
    ];

    (ixs, user_account, user_token_account)
}

/// Sends the `VerifyPubkeyValidity` + `create_user_account` sequence and
/// returns `(user_account, user_token_account)`.
pub fn create_user_account(
    svm: &mut LiteSVM,
    user: &Keypair,
    vault: Address,
    mint: Address,
    token_program: Address,
    associated_token_program: Address,
    keys: &ConfidentialKeys,
) -> (Address, Address) {
    let (ixs, user_account, user_token_account) = build_create_user_account_ixs(
        user,
        vault,
        mint,
        token_program,
        associated_token_program,
        keys,
    );
    send(svm, &ixs, user, &[]);
    (user_account, user_token_account)
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
