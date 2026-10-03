# vault-client

A TS client proving the confidential payroll round trip end to end against a
real (local) validator, not just litesvm: `initialize_vault` →
`configure_treasury_account` → `wrap_confidential` → `fund_treasury` →
`deposit_confidential` → `apply_treasury_pending` → `pause_payroll` (blocks
`pay_employee`) → `resume_payroll` → `pay_employee` (the auditor decrypts the
amount from the event) → `withdraw_confidential` → `unwrap_confidential`.
Mirrors `programs/vault/tests/full_payroll_round_trip.rs` step for step.

## Prerequisites

- [surfpool](https://surfpool.run) installed (`surfpool --version`)
- `vault` and `token_wrap_compliance` built with `--arch v1` and deployed to
  your surfpool instance -- see below. Counterintuitively, this surfpool
  version (checked: 1.4.0) needs the *same* older SBPF target litesvm needs,
  not the default `anchor build`/`cargo build-sbf` output -- a default-arch
  deploy fails with `ELF error: Detected sbpf_version required by the
  executable which are not enabled`. This might differ on devnet/mainnet
  (not yet tested there) or a different surfpool version -- if a deploy
  fails with that error, this is why; if it fails some other way, try the
  default-arch build instead.

## One-time setup

From the repo root:

```bash
# Build both programs with the SBPF target this surfpool version accepts.
cargo build-sbf --arch v1 --manifest-path programs/vault/Cargo.toml
cargo build-sbf --arch v1 --manifest-path native_programs/token_wrap_compliance/Cargo.toml

# Start a local, fully offline Surfnet.
surfpool start --offline --no-deploy --no-tui --no-studio &

# Point the Solana CLI at it and deploy both programs.
solana config set --url http://127.0.0.1:8899
solana program deploy target/deploy/vault.so \
  --program-id target/deploy/vault-keypair.json
solana program deploy target/deploy/token_wrap_compliance.so \
  --program-id target/deploy/token_wrap_compliance-keypair.json
```

If you also want to run the Rust litesvm test suite afterward, the
`vault.so` built above already works for that too (same `--arch v1`
binary) -- no separate rebuild needed either way this time, since both
targets happen to want the same architecture here. That won't necessarily
stay true (they need it for unrelated reasons), so don't assume it going
forward.

`solana config set` points your *global* Solana CLI config at surfpool --
switch it back (`solana config set --url <cluster>`) before doing anything
against devnet/mainnet.

Re-deploy (`solana program deploy ...` again, same command) any time the
Rust source changes; surfpool keeps running across script runs since it's a
long-lived local validator, not a fresh environment per run.

## Running the round trip

```bash
cd client
npm install
npm run round-trip
```

Every step logs what it just did and the addresses/amounts involved; the
final section prints each party's actual vs. expected balance and exits
non-zero if anything doesn't match.

## What's hand-built here, and why

- **`src/lib/tokenWrapCompliance.ts`**: `token_wrap_compliance`'s
  `CreateMint` instruction, hand-encoded. It's a one-time bootstrap, not
  wired into `vault`, so there's no Anchor client for it -- same reasoning
  as the Rust test suite's `tests/common/token_wrap.rs`.
- **`src/lib/token2022Confidential.ts`**: Token-2022's `Deposit`/
  `ApplyPendingBalance` instructions, hand-encoded. `@solana/spl-token`
  (0.4.15) has no confidential-transfer extension support at all -- checked
  its `extensions/` directory directly. The modern `@solana-program/token-2022`
  package does, but it's built on `@solana/kit`, a different transaction
  style from the rest of this script (web3.js + Anchor); hand-building two
  small, well-understood instructions avoided pulling in a second SDK.
- **`src/lib/confidentialTransferProofs.ts`**: the actual proof composition
  for `pay_employee`'s transfer proofs (equality, ciphertext-validity, range) and
  `withdraw_confidential` (equality, range), mirroring
  `spl-token-confidential-transfer-proof-generation`'s Rust logic (which
  this project's Rust test suite depends on directly -- no TS equivalent of
  that crate exists). Built on `@solana/zk-sdk`'s WASM bindings for the
  individual cryptographic primitives, plus `@noble/curves` for the one gap
  in that binding: it doesn't expose ciphertext-level add/subtract/scalar-
  multiply, needed to compute a new balance ciphertext homomorphically. See
  the file's header comment for the full reasoning.
- **`src/lib/zkProof.ts`**: the ZK ElGamal Proof program's `VerifyProof`/
  context-state-account instructions, hand-encoded (discriminants confirmed
  directly against `solana-zk-sdk`'s Rust enum ordering, not guessed).

## Known real-network constraint this surfaced

Creating and populating a proof context-state account
(`create_account` + `VerifyProof`) has to be **two separate transactions**
against a real validator -- combined, most of these proofs push the
transaction past Solana's 1232-byte wire limit. litesvm doesn't enforce this
limit, so the Rust test suite's equivalent helper
(`tests/common/confidential_proof.rs`) does it in one transaction and never
noticed. See `CLAUDE.md` for the full writeup.
