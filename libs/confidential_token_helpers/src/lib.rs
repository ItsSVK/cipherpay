//! Internal, Anchor-flavored helpers for setting up Token-2022
//! confidential-transfer accounts.
//!
//! Extracted from `vault`'s `create_user_account` and
//! `configure_treasury_account`, which had near-identical create ->
//! reallocate -> configure CPI sequences differing only in whether the
//! token account's authority is a wallet signer or a program PDA. Exists to
//! be reused by those two call sites *and* by future confidential P2P
//! transfer instructions (see this workspace's `PRODUCT.md` §1/§11) without
//! a third copy of the same logic.
//!
//! Deliberately **not** published or designed for external consumption --
//! see `PRODUCT.md` §3 and the conversation that led to this crate for why:
//! the differentiated part of this project is the account-model and
//! disclosure-control decisions, not this CPI plumbing, which is honestly
//! just wrapping already-public Token-2022/SPL instructions.

pub mod account_setup;
pub mod error;
pub mod proof;

pub use account_setup::{Authority, ConfidentialAccountSetup};
pub use proof::assert_pubkey_validity_proof;
