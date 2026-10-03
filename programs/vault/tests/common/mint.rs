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
use solana_zk_sdk::encryption::elgamal::ElGamalPubkey;
use solana_zk_sdk_pod::encryption::elgamal::PodElGamalPubkey;
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
    create_confidential_mint_with_auditor(svm, payer, mint, decimals, mint_authority, None)
}

/// Same as [`create_confidential_mint`], but registers `auditor` as the mint's
/// auditor ElGamal pubkey -- like a `token_wrap_compliance`-created mint. Every
/// transfer proof against this mint must then be built with the same auditor
/// pubkey, and the auditor can decrypt each transfer amount.
pub fn create_confidential_mint_with_auditor(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Keypair,
    decimals: u8,
    mint_authority: Address,
    auditor: Option<&ElGamalPubkey>,
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
        auditor.map(|pubkey| PodElGamalPubkey::from(<[u8; 32]>::from(*pubkey))),
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

/// Creates a plain Token-2022 mint with no confidential-transfer extension
/// -- stands in for a real asset like USDC in `wrap_confidential`/
/// `unwrap_confidential` tests, where the *unwrapped* side is never
/// confidential (only the wrapped representation is).
pub fn create_plain_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Keypair,
    decimals: u8,
    mint_authority: Address,
) -> Address {
    let mint_len = ExtensionType::try_calculate_account_len::<TokenMintState>(&[])
        .expect("failed to calculate mint account length");
    let lamports = svm.minimum_balance_for_rent_exemption(mint_len);

    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        lamports,
        mint_len as u64,
        &TOKEN_2022_PROGRAM_ID,
    );

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
        &[create_account_ix, init_mint_ix],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer, mint])
        .expect("failed to sign mint creation transaction");

    svm.send_transaction(tx)
        .expect("failed to create plain mint");

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

/// Creates `owner`'s associated token account for `mint` (via the
/// associated-token-account program's idempotent `Create`, since ATA
/// addresses are PDAs -- `owner` can't sign for them the way
/// [`create_and_fund_token_account`] signs for an arbitrary keypair
/// address) and mints `amount` into it. Needed for `wrap_confidential`/
/// `unwrap_confidential` tests, whose accounts are always the canonical ATA
/// address, never an arbitrary one.
pub fn create_and_fund_associated_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: Address,
    mint_authority: &Keypair,
    owner: Address,
    token_program: Address,
    amount: u64,
) -> Address {
    let create_ata_ix =
        anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &payer.pubkey(),
            &owner,
            &mint,
            &token_program,
        );

    let associated_token_account =
        anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &owner,
            &mint,
            &token_program,
        );

    let mint_to_ix = mint_to(
        &token_program,
        &mint,
        &associated_token_account,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .expect("failed to build MintTo instruction");

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(
        &[create_ata_ix, mint_to_ix],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(message),
        &[payer, mint_authority],
    )
    .expect("failed to sign ATA creation transaction");

    svm.send_transaction(tx)
        .expect("failed to create and fund associated token account");

    associated_token_account
}
