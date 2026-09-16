mod common;

use common::{
    env::{funded_keypair, setup_svm, to_address},
    ix, mint,
    pda::escrow_address,
    token_state::base_amount,
    token_wrap,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// `wrap_confidential` moves a real (unwrapped) asset into its wrapped
/// Token-2022 representation: the caller's unwrapped balance goes down, the
/// escrow's balance goes up by the same amount, and the caller's wrapped
/// balance is credited by the same amount. No `Vault` involved anywhere in
/// this flow.
#[test]
fn wrap_confidential_moves_value_into_the_wrapped_mint() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let owner = funded_keypair(&mut svm);

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

    let owner_unwrapped_token_account = mint::create_and_fund_associated_token_account(
        &mut svm,
        &owner,
        unwrapped_mint,
        &mint_authority,
        owner.pubkey(),
        unwrapped_token_program,
        1_000_000,
    );

    token_wrap::create_wrapped_mint(&mut svm, &owner, unwrapped_mint, wrapped_token_program);

    let owner_wrapped_token_account = ix::wrap_confidential(
        &mut svm,
        &owner,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        400_000,
    );

    let escrow = escrow_address(unwrapped_mint, unwrapped_token_program, wrapped_token_program);

    let owner_unwrapped_data = svm.get_account(&owner_unwrapped_token_account).unwrap();
    assert_eq!(
        base_amount(&owner_unwrapped_data.data),
        600_000,
        "owner's unwrapped balance should be debited by the wrapped amount"
    );

    let escrow_data = svm.get_account(&escrow).unwrap();
    assert_eq!(
        base_amount(&escrow_data.data),
        400_000,
        "escrow should custody the wrapped amount"
    );

    let owner_wrapped_data = svm.get_account(&owner_wrapped_token_account).unwrap();
    assert_eq!(
        base_amount(&owner_wrapped_data.data),
        400_000,
        "owner should be credited with the wrapped amount"
    );
}

/// `unwrap_confidential` reverses `wrap_confidential`: burns the caller's
/// wrapped balance and releases the same amount of the real asset from
/// escrow back to the caller.
#[test]
fn unwrap_confidential_reverses_wrap_confidential() {
    let mut svm = setup_svm();
    let mint_authority = funded_keypair(&mut svm);
    let owner = funded_keypair(&mut svm);

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

    let owner_unwrapped_token_account = mint::create_and_fund_associated_token_account(
        &mut svm,
        &owner,
        unwrapped_mint,
        &mint_authority,
        owner.pubkey(),
        unwrapped_token_program,
        1_000_000,
    );

    token_wrap::create_wrapped_mint(&mut svm, &owner, unwrapped_mint, wrapped_token_program);

    ix::wrap_confidential(
        &mut svm,
        &owner,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        400_000,
    );

    ix::unwrap_confidential(
        &mut svm,
        &owner,
        unwrapped_mint,
        unwrapped_token_program,
        wrapped_token_program,
        associated_token_program,
        150_000,
    );

    let escrow = escrow_address(unwrapped_mint, unwrapped_token_program, wrapped_token_program);

    let owner_unwrapped_data = svm.get_account(&owner_unwrapped_token_account).unwrap();
    assert_eq!(
        base_amount(&owner_unwrapped_data.data),
        750_000,
        "owner's unwrapped balance should be credited back by the unwrapped amount"
    );

    let escrow_data = svm.get_account(&escrow).unwrap();
    assert_eq!(
        base_amount(&escrow_data.data),
        250_000,
        "escrow should release the unwrapped amount"
    );
}
