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
    instruction::initialize_mint2,
    state::Mint as TokenMintState,
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
