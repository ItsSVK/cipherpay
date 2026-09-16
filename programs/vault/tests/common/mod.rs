//! Shared, reusable test helpers for the `vault` program's litesvm test suite.
//!
//! Each submodule owns one concern so individual test files only pull in
//! what they need:
//! - [`env`]: spinning up litesvm + pubkey/address conversions.
//! - [`zk`]: ElGamal/AES key material and the `VerifyPubkeyValidity` proof.
//! - [`mint`]: creating a Token-2022 mint with confidential transfers enabled.
//! - [`pda`]: deriving the program's PDAs.
//! - [`ix`]: building + sending the vault program's own instructions.
//! - [`token_state`]: reading raw Token-2022 account state for assertions.
//!
//! Not every test binary uses every helper here (each `tests/*.rs` file is
//! its own crate), so unused-item warnings in one binary are expected --
//! silenced here rather than papering over them per-function.
#![allow(dead_code)]

pub mod confidential_proof;
pub mod env;
pub mod ix;
pub mod mint;
pub mod pda;
pub mod token_state;
pub mod token_wrap;
pub mod zk;
