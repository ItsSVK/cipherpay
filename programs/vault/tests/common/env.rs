//! LiteSVM setup and the `Pubkey` <-> `Address` conversion helper.
//!
//! The vault program (via anchor-lang) and the client-side crates used in
//! these tests (litesvm, solana-message, solana-zk-sdk, ...) pin two
//! different, semver-incompatible major versions of the Solana "pubkey"
//! crate. They're both plain 32-byte values under the hood, so converting
//! between them is just a byte round-trip -- [`to_address`] and
//! [`to_anchor_pubkey`] centralize that so the rest of the suite never has
//! to think about it.

use anchor_lang::prelude::Pubkey as AnchorPubkey;
use litesvm::LiteSVM;
use solana_address::Address;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Lamports big enough to comfortably rent-exempt any account this suite creates.
pub const FUNDING_LAMPORTS: u64 = 10_000_000_000;

/// Converts an anchor-lang `Pubkey` into the `Address` type used by litesvm
/// and friends.
pub fn to_address(pubkey: AnchorPubkey) -> Address {
    Address::from(pubkey.to_bytes())
}

/// Converts an `Address` (litesvm, solana-zk-sdk, ...) into the `Pubkey`
/// type anchor-lang's generated account/instruction structs expect.
pub fn to_anchor_pubkey(address: Address) -> AnchorPubkey {
    AnchorPubkey::new_from_array(address.to_bytes())
}

/// Path to the compiled vault program, resolved at compile time relative to
/// this crate so it doesn't depend on the test runner's working directory.
const VAULT_PROGRAM_SO: &str =
    concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/vault.so");

/// Spins up a LiteSVM instance with the default SPL programs (System,
/// Token, Token-2022, Associated Token Account, the ZK ElGamal Proof
/// program) plus our own compiled `vault` program loaded at its real
/// on-chain address.
pub fn setup_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(to_address(vault::ID), VAULT_PROGRAM_SO)
        .expect("failed to load target/deploy/vault.so -- run `anchor build` first");
    svm
}

/// Creates a new keypair and funds it with enough lamports for rent + fees.
pub fn funded_keypair(svm: &mut LiteSVM) -> Keypair {
    let keypair = Keypair::new();
    svm.airdrop(&keypair.pubkey(), FUNDING_LAMPORTS)
        .expect("airdrop failed");
    keypair
}
