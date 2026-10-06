# CLAUDE.md

This file orients Claude Code on this repo's **on-chain half** (the Anchor workspace at the repo root). It is the
engineering-facing companion to `PRODUCT.md`. **Read `PRODUCT.md` first**: it has the product intent,
phases, decisions log, and rejected alternatives. The architecture PDF at the repo root
(`Confidential Payroll on Solana Architecture Diagram and Requirements.pdf`) defines the use cases and
the numbered REQ IDs referenced below.

## One repo, two halves

```
<root>/                  <- Anchor workspace (this file)
  PRODUCT.md         product truth
  programs/ native_programs/ libs/ client/   on-chain half
  web/                   Next.js app + client-side proofs/orchestration (own CLAUDE.md)
```

- `web/` is the Next.js app that consumes these programs. It builds transactions against our
  instructions using a client generated from our **IDL**, and generates all ZK proofs in the
  browser. Read `web/CLAUDE.md` for its conventions (it loads automatically when you work inside `web/`).
- **Any change to an instruction's accounts, args, discriminator, events, errors, or PDAs breaks
  `web/` until it is updated.** After such a change, follow "Handoff to web/" below. Check how
  `web/` calls the thing you are changing before you change it.
- When working on the on-chain half, don't edit files under `web/` unless asked. Surface what needs to change
  there instead.

Direction (decided 2026-10-01): **confidential payroll is the product**; the P2P instructions are
the primitive layer under it. See `PRODUCT.md` sections 1, 4, and 9.

## What this workspace is

An Anchor workspace on Solana devnet implementing a PDA-owned custody layer on Token-2022's
Confidential Transfer extension:

- The **vault PDA** owns the treasury token account, so the program can CPI confidential transfers
  on its behalf (`invoke_signed`).
- **ElGamal/AES decryption keys are derived from a real wallet signature** (client-side), never
  from the PDA. Only the key holder, and the mint's auditor, can decrypt.
- **Proofs are generated client-side only.** The program verifies or references them, never
  generates them (it has no private key).

## Layout

```
<root>/
  programs/vault/                        Anchor program (payroll vault + P2P primitives)
    src/instructions/                    one file per instruction
    tests/                               litesvm tests; tests/common/* helpers; tests/fixtures/*.so
  native_programs/token_wrap_compliance/ raw native Solana program (NOT Anchor), fork of Anza spl-token-wrap
  libs/confidential_token_helpers/       shared Rust lib: create -> reallocate -> configure CPI sequence
  client/                                legacy standalone TS round-trip client: see "Legacy folder" below
  web/                                   Next.js app (own CLAUDE.md)
```

- Non-Anchor programs go in `native_programs/`, never `programs/`. `anchor build` scans every
  directory under `programs/` and hard-fails with `IDL doesn't exist` for a program with no
  `#[program]` macro. A stale IDL-build cache can hide this until a later `Cargo.lock` change.
- `libs/confidential_token_helpers` has no entrypoint and is never deployed. Holds
  `account_setup::ConfidentialAccountSetup` (parameterized by `Authority::{Signer, Pda{account,seeds}}`),
  `proof::assert_pubkey_validity_proof`, `mint::assert_confidential_transfer_enabled`. Internal only,
  not a product artifact. `token_wrap_compliance` does **not** consume it (different dependency
  chain).

### Legacy folder

`client/` (standalone TS, web3.js + anchor, proves the round trip on surfpool) is being **ported to
`web/`** (Next.js, `@solana/kit`). Keep it as reference until the port is verified, then remove it. Do
not add new features to it. Its `src/idl/` is stale until the IDL is regenerated. The old simulated Vite
`frontend/` has been deleted (recoverable from git history).

## Deployed addresses (devnet)

| Thing | Address |
|---|---|
| `vault` program | `ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48` |
| `token_wrap_compliance` program | `9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV` |
| Real devnet USDC (classic SPL Token) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| WUSDC wrapped mint (canonical, Token-2022) | `3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf` |

- **`vault` redeployed to devnet on 2026-10-04 (slot 507251861)** with the current `--arch v1` build (all 12
  instructions; byte-identical to `target/deploy/vault.so`, verified via `solana program dump`). Always pass
  `--url devnet` explicitly: the global Solana CLI config may be pointing at localhost.
- Upgrade authority is the default local wallet (`~/.config/solana/id.json`). Coordinate redeploys
  with the team, since `web/` depends on these addresses and on the IDL.
- The wrapped mint is a PDA of `(unwrapped_mint, wrapped_token_program)`: exactly one valid wrapped
  mint per real asset. Never create per-user wrapped mints (transfers only work between accounts of
  the *same* mint). `CreateMint` is a one-time bootstrap (`client/src/bootstrapDevnetWusdc.ts`,
  idempotent).
- Constants live in `programs/vault/src/constants.rs` (`DEVNET_USDC_MINT`, `DEVNET_WUSDC_MINT`, seeds,
  `TOKEN_WRAP_COMPLIANCE_PROGRAM_ID`). `web/` keeps its own copy: keep them in sync.
- WUSDC carries `ConfidentialTransferMint`, `PermanentDelegate`, `PausableConfig`,
  `DefaultAccountState`. Deploy order: `token_wrap_compliance` first (vault CPIs into it).

## Build / test commands

```bash
# Tests (Anchor.toml scripts.test already builds with --arch v1 first)
anchor test

# Manual steps
cargo build-sbf --arch v1 --manifest-path programs/vault/Cargo.toml   # binary litesvm + surfpool can load
anchor build                                                          # IDL generation (SBPFv3 .so, NOT loadable by litesvm/surfpool)
anchor deploy --provider.cluster devnet
solana logs -u devnet
```

### The `--arch v1` ordering hazard (cost real time, read this)

- litesvm 0.10.0 and the surfpool version used locally (1.4.0) cannot load the default SBPFv3
  `vault.so`. Symptoms: generic `InvalidAccountData` from `add_program_from_file`, or `ELF error:
  Detected sbpf_version required by the executable which are not enabled`.
- The `platform-tools` symlink under the Solana CLI's `sbf/dependencies/` is shared, mutable state
  that tracks whichever arch was built *most recently*. A bare `anchor build` after a `--arch v1`
  build silently overwrites `target/deploy/vault.so` with the SBPFv3 binary.
- **Rule:** if you need the IDL, run `anchor build` first, then `cargo build-sbf --arch v1`
  **last**, before litesvm tests, surfpool, or a devnet deploy. Never the other order. The same
  hazard applies between "deploy" and "litesvm test".
- If `cargo build-sbf --arch v1` fails with `No such file or directory` for a `...-sbpf-solana-v1.52/bin/rustc`
  path: the symlink points at the wrong cached platform-tools. Fix with
  `cargo build-sbf --arch v1 --force-tools-install`, and check `readlink` on the symlink before
  assuming the code is at fault.

### Handoff to `web/`

After changing any instruction, account, event, error, or PDA seed:

1. `anchor build` (regenerates `target/idl/vault.json`), then **`cargo build-sbf --arch v1` last**.
2. Tell the team that the IDL changed and which instructions it touches. `web/` regenerates its
   `@solana/kit`-compatible client from `target/idl/vault.json` (see `web/CLAUDE.md`).
3. If you added or changed a deployed program, redeploy to devnet, then confirm `web/` points at
   the right address.
4. If the instruction needs new client-side proof work, say so explicitly: the proof pipeline lives
   in `web/`, and `tests/common/confidential_proof.rs` is only a reference implementation.

## Repo conventions: follow these, don't reinvent them

- **One file per instruction** under `programs/<program>/src/instructions/`.
- **Pattern per instruction file:**
  1. `#[derive(Accounts)]` struct named after the instruction (`InitializeVault`, `CreateConfidentialAccount`).
  2. `impl<'info> X<'info>` with a private method holding the logic (`fn initialize_vault(&mut self, ...)`).
  3. `pub fn handle_x(ctx: Context<X>, ...)` that calls the impl method and emits an event.
  Keep logic testable independent of `Context` wiring. Don't collapse the split.
- **Seeds** are named byte-string constants in `constants.rs` (`VAULT_SEED`, `WRAPPED_MINT_SEED`), never inline.
- **Events** in `events.rs`, one struct per state-mutating instruction, emitted at the end of the
  handler (not in the impl method). `PayEmployeeEvent` carries no plaintext amount (only auditor ciphertexts);
  `WithdrawConfidentialEvent` includes it (the disclosure point). The `pay_employee` event carries
  the recipient and the amount **encrypted for the auditor** (never plaintext), so the auditor
  view can decrypt it (`PRODUCT.md` section 7.6, REQ07). Event names follow `<Instruction>Event` (`PayEmployeeEvent`, `WithdrawConfidentialEvent`, ...).
- **Errors** in `error.rs` as a single `#[error_code] pub enum VaultError`. No per-instruction enums.
- **State** in `state.rs`, deriving `InitSpace` so `8 + X::INIT_SPACE` works.
- **Token-2022 extension validation is manual.** `InterfaceAccount<Mint>`/`TokenAccount` only
  validate the base layout. Anything depending on `ConfidentialTransferMint`/`ConfidentialTransferAccount`
  must unpack TLV data via `StateWithExtensions`/`get_extension::<T>()` and fail loudly. Reuse
  `assert_confidential_transfer_enabled`.
- **Proof-bearing token accounts can't use Anchor `init` sugar.** They need extra space and a
  multi-step CPI sequence (create -> reallocate -> configure). Intentionally manual; use
  `ConfidentialAccountSetup`.
- **Proofs come from the client.** Either a `VerifyProof`-style instruction earlier in the same
  transaction, or a context-state account referenced by address. The program only verifies or
  references.

### Payroll operator (added 2026-10-06)

- **What:** `set_operator(operator: Pubkey, expires_at: i64, max_payments: u32)`, admin-only. Stores
  `OperatorConfig { vault, operator, expires_at, payments_left, bump }` in its own PDA `[b"operator_v2", vault]` (`OPERATOR_SEED`; the
  `_v2` seed is because adding `payments_left` changed the account size, so an older 81-byte config under `"operator"` is simply left
  behind). `operator = Pubkey::default()` revokes (clears expiry and count). A real operator needs `expires_at` in the future and at
  most `MAX_OPERATOR_TTL_SECONDS` (24 h) away (`InvalidOperatorExpiry`; never-expiring is no longer allowed) and `max_payments >= 1`
  (`InvalidOperatorLimit`). Emits `SetOperatorEvent` (with `payments_left`).
- **Count cap (2026-10-06):** each operator-signed `pay_employee` spends one payment (`OperatorLimitReached` at 0); admin-signed ones
  don't. The program can cap the NUMBER of payments, not their value (amounts are encrypted). `pay_employee`'s `operator_config` is now
  **writable**. Tests: `tests/operator.rs` (13).
- **`pay_employee` rule:** the signer must be `Vault.authority`, or the vault's operator if one is set and unexpired. The operator
  cannot pause, resume, fund, or call `set_operator`; it can pay, that is all. A paused vault blocks the operator too.
- **Why a separate PDA, not fields on `Vault`:** `Vault`'s layout is unchanged, so every vault already on devnet (including funded ones)
  keeps deserializing after the program is upgraded. No migration. `pay_employee` gets an `operator_config` account that is **always
  passed** (clients derive it from the vault) and only read when the signer is not the admin; it is an `UncheckedAccount` with a seeds
  constraint so the address is pinned, and the owner + discriminator are checked before the data is trusted (an admin payment never
  needs it to exist).
- **Trade-off, stated plainly:** amounts are encrypted, so the program cannot cap what an operator pays. An operator can pay any
  employee account that is set up for confidential pay, up to the treasury's spendable balance. The admin limits the exposure with
  `expires_at` and by revoking. The operator key is meant to be derived and held by the admin's own client, never a server.
- **`PayEmployeeEvent` now has `signer`** (who signed: the admin or the operator) so the auditor can tell the two apart.
- **Gotchas:** `anchor-lang` needs the `init-if-needed` feature for `set_operator`'s `init_if_needed`; litesvm's clock is
  `solana-clock` 3.x (dev-dependency) and `svm.set_sysvar(&Clock { unix_timestamp, .. })` is how the tests move time; the shared payroll test
  fixture now lives in `tests/common/payroll.rs`.

#### What `web/` must change for this (the IDL changed)

1. `anchor build` then `cargo build-sbf --arch v1` last, then in `web/`: `bun run gen:vault`.
2. `pay_employee`: the signer account is renamed `admin` -> **`signer`**, and there is a new trailing account **`operatorConfig`**
   (verified with Codama: `getPayEmployeeInstructionAsync` derives it from the vault; the sync `getPayEmployeeInstruction` that
   `lib/chain/pay.ts` uses needs it passed, e.g. `(await findOperatorConfigPda({ vault }))[0]`, a finder Codama generates).
   `lib/chain/pay.ts` passes `admin: adminSigner` today and must pass `signer:`. Nothing else in that file changes.
3. New instruction `setOperator({ operator, expiresAt, maxPayments })` (accounts: `admin`, `vault`, `operatorConfig`, `systemProgram`).
4. `PayEmployeeEvent` gained `signer`; `SetOperatorEvent` is new.
5. Redeploy `vault` to devnet (needs an explicit go-ahead: costs SOL, upgrade authority is the default local wallet) before `web/` can
   use it; existing devnet vaults keep working.
6. Product flow in `web/`: one-time "Authorize payroll helper" (the derived helper key becomes the operator, with an expiry), then
   `payOne` signs `pay_employee` with the helper instead of prompting the wallet. Revoke after a run or let it expire.

## Canonical instruction set (from the architecture PDF; names must match)

`vault` has exactly these 12 instructions, named exactly as in the PDF (and in REQ IDs, tests, events):
`pay_employee`, `withdraw_confidential`, `pause_payroll`, `resume_payroll`, `initialize_vault`,
`configure_treasury_account`, `fund_treasury`, `deposit_confidential`, `apply_treasury_pending`,
`create_confidential_account`, `wrap_confidential`, `unwrap_confidential`. Use the REQ/UC IDs in commit
messages and test names. Don't add instructions outside this list without surfacing it. Don't add
instructions the client can already do directly. If code and PDF disagree on a name, fix the code (or fix
both, deliberately).

**One deliberate addition, decided 2026-10-06 (not in the PDF): `set_operator`** (13th instruction). It lets the
admin authorize a single "payroll operator" key that may call `pay_employee` and nothing else, so a payroll run does
not need the admin's wallet to approve every payment (a wallet that is slow to show its popup missed devnet's
~40-second transaction window every time, so payroll was unusable). The architecture PDF cannot be edited from here:
update it deliberately when convenient. Design below, in "Payroll operator".

Codebase vs PDF right now: all 12 PDF instructions exist and match the PDF's names; the only extra is `set_operator`.
`create_user_account`/`UserAccount` and `transfer_confidential` have been removed (employees are wallet-owned;
`pay_employee` replaced the wallet-signed transfer). Verified in litesvm and on a local surfpool validator.

## Current state (keep accurate, not aspirational; update when you finish something)

### Primitives without a `Vault` (Phase 0, done)

| Instruction | Status |
|---|---|
| `create_confidential_account` | Done, tested. Wallet's own confidential account on any confidential mint. Reuses `ConfidentialAccountSetup` with `Authority::Signer`. |
| `wrap_confidential` / `unwrap_confidential` | Done, tested. CPI into `token_wrap_compliance` Wrap/Unwrap (public balance only). CPI is **hand-built** (see lessons). |
| `withdraw_confidential` | Done, tested. 2 proofs (equality, range). `amount` is plaintext on purpose (disclosure point). |
| Full payroll round trip | Proven in `tests/full_payroll_round_trip.rs` (litesvm) **and on a local surfpool validator** via `client/src/roundTrip.ts`: wrap -> fund treasury -> pause blocks `pay_employee` -> resume -> pay -> auditor decrypts the event -> employee withdraws -> unwrap. **Also run on real devnet (2026-10-04)** against the redeployed `vault` and `token_wrap_compliance`, via `npm run round-trip:devnet` in `client/` (the local one is `npm run round-trip:surfpool`) (it makes its own throwaway real-asset and wrapped mints, not the canonical WUSDC). **Not run through the web app.** |

Round-trip chain (current test): `initialize_vault` -> `configure_treasury_account` -> `wrap_confidential` ->
`fund_treasury` -> `deposit_confidential` -> `apply_treasury_pending` -> employee
`create_confidential_account` -> `pay_employee` -> employee `ApplyPendingBalance` (Token-2022, direct) ->
`withdraw_confidential` -> `unwrap_confidential`.

### Payroll instructions (Phase 1 plan; original numbering kept for continuity)

| # | Instruction | Status | Notes |
|---|---|---|---|
| 1 | `initialize_vault` | Done, tested | Validates Token-2022 mint with `ConfidentialTransferMint` (REQ13). Renamed from `initialize`. |
| 2 | `create_user_account` | **Removed** | PDA-owned employee account, deleted: employees are wallet-owned (decision 9). |
| 3 | `configure_treasury_account` | Done, tested | Treasury owner = vault PDA (`invoke_signed`); decrypt authority = admin's ElGamal key. |
| 4 | `update_auditor_key` | **Not a vault instruction** | Rotation is a direct Token-2022 `UpdateMint` signed by the mint's confidential-transfer authority (deployer wallet), done from a script or client, not a vault CPI (REQ21, roadmap). |
| 5 | `pause_payroll` / `resume_payroll` | Done, tested (UC3, REQ11, REQ12) | Flag flip on `Vault.paused`, authority-only (`Unauthorized` otherwise), idempotent. Guard lives in `pay_employee` only; withdrawals stay open on purpose. Tests: `tests/pause_payroll.rs`. |
| 6 | employee add/update/remove | **Cut** | Employee list is off-chain (`PRODUCT.md` decision 5). |
| 7 | `fund_treasury` | Done, tested | Plain `transfer_checked`, permissionless. |
| 8 | `deposit_confidential` / `apply_treasury_pending` | Done, tested | `invoke_signed` with vault seeds. |
| 9 | `pay_employee` | Done, tested in litesvm and on surfpool (UC1, REQ01 to REQ07) | Signer must be `Vault.authority` **or the vault's unexpired operator** (REQ03, `Unauthorized` / `OperatorExpired`); that check runs in the handler and comes **before** `paused == false` (REQ02, `PayrollPaused`) (it used to be an account constraint on `admin`; the signer account is now named `signer`). Treasury -> one employee confidential `Transfer`, `invoke_signed` with vault seeds (REQ04), three context-state proofs (REQ05). `PayEmployeeEvent` carries the auditor ciphertexts lo/hi taken **from the instruction args** (Token-2022 requires them to match the validity-proof context, so no need to read the context account); the auditor recovers the amount as `lo + hi * 2^16`. `tests/pay_employee.rs` proves this by decrypting the event with the auditor's secret key. On surfpool and devnet the same decryption works against the burned demo auditor key (see `DEVNET_DEMO_AUDITOR_KEY.md`, whose secret is on record). |
| 9b | `set_operator` | Done, tested (2026-10-06, `tests/operator.rs`) | Admin-only. Authorizes (or revokes, with the default key) one operator key and an optional expiry. See "Payroll operator". **Deployed to devnet 2026-10-06 (with count and TTL caps; binary verified identical to the tested build).** |
| 10 | `batch_pay` | **Client pipeline, not a monolithic instruction** (D3) | Lives in `web/`. On-chain you only need `pay_employee` (optionally a small `PayrollRun` state account for idempotency/resume if the team wants it). |
| 11 | `employee_apply_pending` | **Not needed as a vault instruction** | Employee calls Token-2022 `ApplyPendingBalance` directly. |
| 12 | payroll `withdraw_confidential` | **Not needed** (decision 9) | Existing P2P `withdraw_confidential` covers UC2 (REQ08 to REQ10); employees are wallet-owned. |
| 13 | `close_user_account` | **Cut** | |

**Decided 2026-10-04: no flat per-payout fee in the hackathon build.** `pay_employee` has no fee logic. If one is
added later (system-program SOL transfer or a fixed plaintext token amount to a fee wallet stored on `Vault`) it
changes the instruction's accounts, so it needs an IDL regeneration and a redeploy. See "Fees" below.

### Open decisions that touch this half (don't pick silently; surface them)

- **Decided (was D1): employee accounts are wallet-owned** via `create_confidential_account`.
  Employees reuse the P2P `withdraw_confidential` and `unwrap_confidential`; every signer pays their
  own fees, so employees need their own SOL for withdrawals.
- **D2, auditor scope.** The canonical WUSDC mint has one mint-level auditor, shared by every
  employer on this mint. Per-employer auditors are Phase 2.
- **D3, batch design.** Client pipeline, not an on-chain loop. Per recipient: three proof-context creations
  (parallelizable within one recipient), then one `pay_employee`. **Transfers from the same treasury must be
  serialized**: each equality proof is built against the treasury's current available-balance ciphertext, so
  transfer N depends on transfer N-1 landing (or on deterministic client-side forward computation). Roughly 7
  transactions per employee.
- **D4, vault approve-policy** (`auto` vs `manual` new-account approval) is still undecided.
- **D7, authority roles on WUSDC** all point to one deployer wallet. Fine for devnet, split before
  real funds.

### Auditor key (a known gap that blocks the auditor view)

The auditor ElGamal pubkey baked into `native_programs/token_wrap_compliance/src/mint_customizer/compliance.rs`
(`AUDITOR_ELGAMAL_PUBKEY_B64`) is a **randomly generated throwaway** (see
`DEVNET_DEMO_AUDITOR_KEY.md`), not derived from a wallet signature like every other key here. The
`web/` auditor view needs the matching secret to decrypt. Confirm the secret exists, or rotate the
mint's auditor to a key the team controls with a direct Token-2022 `UpdateMint` (not a vault
instruction), then tell `web/` which key it is.
**Any proof for a transfer on a `token_wrap_compliance`-created mint must be built against this
exact auditor pubkey**, or Token-2022 fails with `"ElGamal public key mismatch"`. Mints from
`mint::create_confidential_mint` (tests) have no auditor, so pass `None` there.

### Fees

Hidden amounts mean **the program cannot enforce a percentage fee**: it can't compute a percentage of a
value it can't read. Any on-chain fee must be **flat and plaintext**. Split-payout percentages
(e.g. 79/20/1) are client-side policy verifiable by the auditor, not on-chain enforcement. Don't
design instructions that assume the program can check confidential amounts.

## Design decision: disclosure control, not anti-correlation

Governs any instruction that moves value from confidential to transparent (`Withdraw`, `Unwrap`).
Full reasoning in `PRODUCT.md` section 7.4.

- Confidential transfer hides *the transfer*, not a balance forever. `Withdraw` and `Unwrap`
  already accept arbitrary partial amounts: that is the entire disclosure-control mechanism. No new
  instruction logic needed.
- The correlation leak is symmetric (sender's wrap/deposit and recipient's withdraw/unwrap are both
  plaintext).
- **Do not build batching-as-obfuscation, jitter, or mixing to defend against this.** That is the
  shielded-pool/Tornado territory already rejected. If asked "how do we make it harder to trace",
  the answer is still no; re-read the section rather than re-litigating.
- In scope: make partial/delayed disclosure a real default in the UI, and be explicit in product
  copy about what is hidden vs revealed.

## Hard-won lessons: don't relearn these

- **`spl-token-cli` must be >= 5.6.1** for manual CLI testing. Earlier versions fail with
  `SigmaProof(PubkeyValidity, AlgebraicRelation)` even when the command is correct. Install with
  `cargo install spl-token-cli --force --locked`; without `--locked` you can pull mismatched
  `wincode` versions and get confusing trait-bound errors.
- **This ecosystem moves fast.** The ZK ElGamal Proof program was disabled mid-2025 and re-enabled
  ~June 2026, with breaking client changes. If something that should work doesn't, check package
  versions first, and check any tutorial's date against that timeline.
- **Proof-instruction offsets are relative to the top-level transaction instruction, not CPI
  depth.** `-1` means "the instruction right before this top-level one", both for our own check and
  for Token-2022's independent re-check inside a nested CPI. Don't adjust offsets for call depth.
  `inner_configure_account` only reads the offset from `ProofLocation::InstructionOffset`; a
  placeholder proof-data value is fine there. `anchor_lang::solana_program::sysvar::instructions`
  does not re-export `ID`/`check_id`/`id()`; take the address from the `solana-instructions-sysvar`
  crate directly.
- **`invoke` vs `invoke_signed` depends on who owns the token account in Token-2022**, not on which
  file you are in. Wallet-owned: plain `invoke`. PDA-owned (treasury): `invoke_signed` with
  `[VAULT_SEED, vault.authority, vault.mint, bump]`. Check the owner before copying from a sibling.
- **Spend authority and decryption authority are independent.** The treasury's Token-2022 owner is
  the vault PDA; its registered ElGamal pubkey is the admin's. Token-2022 doesn't require them to
  match.
- **litesvm's bundled Token-2022 is stale and fails with generic errors.** litesvm 0.10.0 bundles
  `spl_token_2022-10.0.0.so`, which predates the `decimals` field on confidential `Deposit`, so a
  correctly built instruction fails with `InvalidInstructionData`. We build a matching v11.0.0
  binary and load it over the bundled one in `setup_svm()` (load it *before* `vault`). It is checked
  in at `programs/vault/tests/fixtures/spl_token_2022-11.0.0.so`; rebuild command is in
  `tests/common/env.rs`. Upgrading litesvm isn't viable: 0.13.0 pins `solana-address = "=2.2.0"`,
  0.14/0.15 hit a `wincode` split, 0.16.0 needs nightly Rust. **General lesson:** when a correctly
  built CPI fails against litesvm with a generic low-level error, suspect a stale bundled artifact
  before suspecting your encoding.
- **litesvm is not representative of real-network limits.** A real validator enforces the 1232-byte
  transaction limit; litesvm does not. `tests/common/confidential_proof.rs`'s
  `create_proof_context_account` packs `create_account` + `VerifyProof` in one transaction and
  passes litesvm, but fails on a real cluster (`Transaction too large: 1358 > 1232`). The TS client
  splits them into two transactions. Don't use that Rust helper as a template for anything that
  must work on a real cluster.
- **The `token_wrap_compliance` CPI is hand-built on purpose.** Three mutually incompatible
  `solana-instruction` majors coexist in this workspace (`token_wrap_compliance` 2.x, anchor-lang
  3.x, `spl-token-2022-interface` 4.x), so the fork's own Rust builders return types `invoke()`
  can't accept. `vault` replicates the wire format directly (account order +
  `[discriminant_byte, u64_le_amount]`). PDAs (`wrapped_mint`, `wrapped_mint_authority`) are validated
  via Anchor `seeds`/`seeds::program`. If the fork's account order or seeds change, update
  `wrap_confidential.rs`, `unwrap_confidential.rs`, **and** `tests/common/token_wrap.rs` together;
  nothing enforces that automatically. (`solana-pubkey` 3.0.0 and `solana-address` 1.1.0 are shims over
  `solana-address` 2.7.0, so anchor `Pubkey` and litesvm `Address` are the same type; check with
  `cargo tree -i <crate>` before assuming a conversion is needed.)
- **Proof generation crate pin.** `spl-token-confidential-transfer-proof-generation` is pinned to
  `0.5.1` because its `solana-zk-sdk` requirement (`4.0.0`) matches the test suite's key material.
  `0.6.1` needs `solana-zk-sdk = "7.0.1"` and returns types from a different crate. Don't bump
  without re-checking. `bytemuck::bytes_of` is needed to get raw bytes out of Pod-only types.
- **`pay_employee` (and `withdraw_confidential`) only accept the context-state-account form of `ProofLocation`**,
  because the proofs don't fit alongside the instruction. They don't close the context accounts; the
  client can call `CloseContextState` separately to reclaim rent.
- **Combined tests catch what pairwise tests can't.** The full round trip surfaced the auditor-pubkey
  mismatch above immediately. Prefer an end-to-end test for any new multi-instruction flow.

## Working style expected on this project

- **`anchor test` passing is the bar for "done", not "compiles".** Proof/CPI plumbing has failed
  silently or with misleading errors here before. Write the test before declaring an instruction done.
- A passing litesvm test is not proof it works on a real validator (see tx-size lesson). For
  anything on the critical path, also run it against local surfpool or devnet.
- When you finish an instruction, **update the status tables in this file** before moving on.
- If you hit a design decision not already resolved in `PRODUCT.md`, **surface it explicitly**
  rather than picking silently.
- Don't deploy to devnet or touch authority/upgrade keys without an explicit go-ahead (it costs SOL
  and puts something live that `web/` depends on). Mainnet is out of scope.
- Don't add instructions the client can already do directly (e.g. a P2P `deposit_confidential`).
