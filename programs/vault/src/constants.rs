use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Seed for a vault's `OperatorConfig` PDA: `[OPERATOR_SEED, vault]`. Each `_vN` bump abandons the previous config accounts rather than
/// migrating them (a smaller old account can't be read as the bigger new struct): v2 added the payment count, v3 the replay
/// sequence. Nothing real depended on them, so they are simply left behind.
#[constant]
pub const OPERATOR_SEED: &[u8] = b"operator_v3";

/// The longest an operator authorization may last (24 hours). `set_operator` rejects a longer or a never-expiring one, so a
/// forgotten operator can't stay live indefinitely.
#[constant]
pub const MAX_OPERATOR_TTL_SECONDS: i64 = 24 * 60 * 60;

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

/// Circle's official devnet USDC mint (classic SPL Token program, not
/// Token-2022) -- confirmed live on-chain via `getAccountInfo` before use,
/// not assumed from a faucet page. This is the `unwrapped_mint` side of the
/// one canonical WUSDC wrapped mint below.
pub const DEVNET_USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/// The confidential-transfer-capable wrapped mint for `DEVNET_USDC_MINT`,
/// bootstrapped once on devnet via `token_wrap_compliance`'s `CreateMint`
/// (`client/src/bootstrapDevnetWusdc.ts`). This is a PDA of
/// `TOKEN_WRAP_COMPLIANCE_PROGRAM_ID` derived from
/// `(DEVNET_USDC_MINT, TOKEN_2022_PROGRAM_ID)` alone -- **not** an
/// arbitrary choice. Every wallet that wraps devnet USDC through this
/// program wraps into this same mint (into its own token *account* on it,
/// never a mint of its own); see CLAUDE.md's "should we create a WUSDC
/// mint and make it constant" note for why a per-user wrapped mint would
/// break P2P transfers outright (two parties on different mints can't
/// transfer to each other at all). Re-running `CreateMint` against this
/// same pair is a no-op (idempotent), so this constant never goes stale
/// as long as `DEVNET_USDC_MINT` doesn't change.
pub const DEVNET_WUSDC_MINT: Pubkey = pubkey!("3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf");
