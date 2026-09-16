use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
pub const USER_SEED: &[u8] = b"user";

/// Program ID of our confidential-transfer-aware fork of spl-token-wrap
/// (`native_programs/token_wrap_compliance`). Deliberately **not** a Cargo
/// dependency of this crate: that program's pinned `solana-instruction`/
/// `solana-pubkey` versions are an older, incompatible major-version chain
/// from this crate's (anchor-lang's), so `wrap_confidential`/
/// `unwrap_confidential` hand-build the CPI `Instruction` using this crate's
/// own types instead of importing its builder functions. Keep the constants
/// below in sync with `native_programs/token_wrap_compliance/src/lib.rs` and
/// `src/instruction.rs` if that program's wire format or seeds ever change.
pub const TOKEN_WRAP_COMPLIANCE_PROGRAM_ID: Pubkey =
    pubkey!("9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV");

/// Must match `token_wrap_compliance`'s own (private) `WRAPPED_MINT_SEED`.
pub const WRAPPED_MINT_SEED: &[u8] = b"mint";
/// Must match `token_wrap_compliance`'s own (private)
/// `WRAPPED_MINT_AUTHORITY_SEED`.
pub const WRAPPED_MINT_AUTHORITY_SEED: &[u8] = b"authority";
