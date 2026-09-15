//! Creates a Token-2022 mint with the `ConfidentialTransferMint` extension
//! enabled, since that's a precondition the vault program enforces
//! (`assert_confidential_transfer_enabled`) before it'll operate on a mint.

use anchor_lang::solana_program::system_instruction;
use litesvm::LiteSVM;
use solana_address::Address;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use spl_token_2022_interface::{
    extension::{confidential_transfer, ExtensionType},
    instruction::{initialize_account3, initialize_mint2, mint_to},
    state::{Account as TokenAccountState, Mint as TokenMintState},
    ID as TOKEN_2022_PROGRAM_ID,
};

/// Creates a fresh Token-2022 mint with confidential transfers enabled (no
/// auditor, auto-approve new accounts) and no freeze authority. Returns the
/// mint's address.
pub fn create_confidential_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Keypair,
    decimals: u8,
    mint_authority: Address,
) -> Address {
    let mint_len = ExtensionType::try_calculate_account_len::<TokenMintState>(&[
        ExtensionType::ConfidentialTransferMint,
    ])
    .expect("failed to calculate mint account length");
    let lamports = svm.minimum_balance_for_rent_exemption(mint_len);

    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        lamports,
        mint_len as u64,
        &TOKEN_2022_PROGRAM_ID,
    );

    // Must run before the base `InitializeMint2`: once the mint is marked
    // initialized, the confidential transfer extension can no longer be
    // configured this way.
    let init_confidential_transfer_ix = confidential_transfer::instruction::initialize_mint(
        &TOKEN_2022_PROGRAM_ID,
        &mint.pubkey(),
        Some(mint_authority),
        true,
        None,
    )
    .expect("failed to build confidential transfer InitializeMint instruction");

    let init_mint_ix = initialize_mint2(
        &TOKEN_2022_PROGRAM_ID,
        &mint.pubkey(),
        &mint_authority,
        None,
        decimals,
    )
    .expect("failed to build InitializeMint2 instruction");

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(
        &[create_account_ix, init_confidential_transfer_ix, init_mint_ix],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer, mint])
        .expect("failed to sign mint creation transaction");

    svm.send_transaction(tx)
        .expect("failed to create confidential mint");

    mint.pubkey()
}

/// Creates a plain (no confidential-transfer extension) Token-2022 account
/// for `mint`, owned by `owner`, and mints `amount` into it. Represents an
/// ordinary depositor's existing public balance -- the kind `fund_treasury`
/// draws from.
pub fn create_and_fund_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: Address,
    mint_authority: &Keypair,
    token_account: &Keypair,
    owner: Address,
    amount: u64,
) -> Address {
    let account_len = ExtensionType::try_calculate_account_len::<TokenAccountState>(&[])
        .expect("failed to calculate token account length");
    let lamports = svm.minimum_balance_for_rent_exemption(account_len);

    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &token_account.pubkey(),
        lamports,
        account_len as u64,
        &TOKEN_2022_PROGRAM_ID,
    );

    let init_account_ix = initialize_account3(
        &TOKEN_2022_PROGRAM_ID,
        &token_account.pubkey(),
        &mint,
        &owner,
    )
    .expect("failed to build InitializeAccount3 instruction");

    let mint_to_ix = mint_to(
        &TOKEN_2022_PROGRAM_ID,
        &mint,
        &token_account.pubkey(),
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .expect("failed to build MintTo instruction");

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(
        &[create_account_ix, init_account_ix, mint_to_ix],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(message),
        &[payer, token_account, mint_authority],
    )
    .expect("failed to sign token account creation transaction");

    svm.send_transaction(tx)
        .expect("failed to create and fund token account");

    token_account.pubkey()
}
