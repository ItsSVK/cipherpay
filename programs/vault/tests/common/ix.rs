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
