# CLAUDE.md (web/)

This file orients Claude Code on the **app half** of the product: the Next.js app, plus all
client-side proof generation and payout orchestration. It is the engineering-facing companion to
`../PRODUCT.md`. **Read `../PRODUCT.md` first**: it has the product intent, user flows, phases,
decisions log, and rejected alternatives.

## You are working on half of one repo

```
<root>/                 Anchor workspace: on-chain programs, tests, deploys (root CLAUDE.md)
  PRODUCT.md        shared product truth
  web/                  <- YOU ARE HERE: Next.js app
```

- The repo root (`../`) holds the on-chain programs this app talks to: `vault` (Anchor) and
  `token_wrap_compliance` (native). Read `../CLAUDE.md` for the instruction status tables,
  account models, and the lessons about proofs and CPIs. **Before wiring an instruction, read its
  source in `../programs/vault/src/instructions/<name>.rs`** (account order, signers, args)
  and, if present, its test in `../programs/vault/tests/` (the working call sequence).
- The generated program client in this app comes from `../target/idl/vault.json`. If an
  instruction you need doesn't exist yet or its accounts changed, **ask for the on-chain change
  rather than working around it**, and don't edit the on-chain code (`../programs/` etc.) from here unless asked.
- Legacy reference to port from: `../client/` (standalone TS proving the full round trip on surfpool:
  **the reference for proof generation**). Port, don't import from it. This app uses `@solana/kit`,
  not `web3.js`/`@coral-xyz/anchor`. The old simulated Vite `frontend/` was deleted; the app is
  being designed from scratch (recoverable from git history if something is wanted).

## What this app does

The employer-facing (and employee- and auditor-facing) product for **confidential payroll on
Solana devnet**. In the browser it: connects a wallet, derives ElGamal/AES keys from a wallet
signature, generates ZK proofs, runs the batch payout pipeline against the on-chain programs, and
decrypts balances/amounts for the right party. Server code handles only **non-secret** data
(employee lists, payout rules, approvals, run history).

## Stack

- **Next.js** (App Router) + TypeScript. Check `package.json` for the exact version.
- **Bun** is the package manager and script runner. Use `bun install`, `bun add`, `bun run <script>`,
  `bunx <tool>`. Don't create `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`.
- **Tailwind CSS** + **shadcn/ui** (`bunx shadcn@latest add <component>`). Use the shadcn
  primitives before writing custom ones.
- **`@solana/kit`** (v6) for RPC, transactions, signers. **Not** `@solana/web3.js`.
- `@solana-program/token-2022` and `@solana-program/token-2022/confidential` for Token-2022
  instructions and key derivation (`deriveElGamalKeypairForOwnerMint`, `deriveAeKeyForOwnerMint`).
- `@solana/zk-sdk` (official WASM binding) for proofs/encryption, and `@noble/curves` for the
  Ristretto255 point arithmetic the WASM binding doesn't expose.
- Wallet connection via **wallet-standard** (e.g. `@solana/react` or wallet-standard directly).
  Pick one on day 1 and record it here.
- A **generated program client** for `vault` from the Anchor IDL via Codama
  (`@codama/nodes-from-anchor` + `@codama/renderers-js`), which produces `@solana/kit`-compatible
  code. Verify this against current Codama docs before relying on it, and record the exact
  generate command in "Commands" once it works. Generated code lives in one folder (e.g.
  `src/generated/vault/`) and is **never hand-edited**.

## Commands

```bash
bun install
bun run dev          # next dev
bun run build
bun run lint
bun run typecheck    # add a script if missing: tsc --noEmit
bun test             # pure-logic tests (split math, amount handling); add if missing
```

Record here, as they get decided: the client-generation command, the IDL path, the env vars, and
which RPC provider is used. The public devnet RPC rate-limits aggressively once the pipeline fires
many parallel transactions, so plan for a dedicated devnet RPC URL in env.

## Suggested structure (adjust, but keep crypto/chain code out of components)

```
web/src/
  app/                    routes (App Router)
    (admin)/              vault setup, fund treasury, payroll list, run payroll, split payout
    (employee)/           activate, my pay, withdraw/unwrap
    (auditor)/            decrypt all payments
    api/                  route handlers: NON-SECRET data only (employees, rules, approvals, runs)
  components/             UI (shadcn in components/ui)
  generated/vault/        Codama-generated client (do not edit)
  lib/
    chain/                constants, RPC, program addresses, PDA helpers, tx send/confirm
    crypto/               key derivation, proof generation, ciphertext arithmetic, decryption
    payroll/              simulation, split math, batch pipeline, resume logic
    wallet/               wallet-standard connection, signMessage
  server/                 db access, validation (server-only)
```

## Hard rules for keys and crypto (security, not style)

1. **ElGamal keys, AES keys, and the derivation signature never leave the browser.** Never send
   them (or the raw `signMessage` signature) to an API route, log them, put them in analytics,
   error reports, URLs, cookies, or any storage. **Do not use `localStorage`, `sessionStorage`, or
   IndexedDB for keys.** Keep derived keys in memory (a module closure or React context) for the
   session, and clear them on wallet disconnect or account change.
2. **All proof generation and decryption is client-only.** Mark those modules `'use client'` /
   import `@solana/zk-sdk` dynamically with SSR disabled. Server code must not import
   `src/lib/crypto/*`.
3. **The server only ever sees non-secret data**: wallet addresses, employee names, payout rules,
   approval state, transaction signatures, run status. Amounts that are meant to be confidential
   on-chain may appear in the off-chain payroll list because the employer entered them; treat that
   database as sensitive (auth, access control) even though it holds no keys.
4. **Use `bigint` for all token amounts.** USDC/WUSDC have 6 decimals. No floating point anywhere
   in amount math. Format only at the UI edge.
5. **Derive keys per `(owner, mint)`** exactly as the Rust/TS reference does. If derivation differs,
   proofs fail verification with opaque errors.

## Where the WASM bites in Next.js

`@solana/zk-sdk` is WASM. Expect to need: client-only dynamic import, WASM support enabled in the
bundler config (check whether the app uses Turbopack or webpack and the current Next.js docs for
async WASM), and proof generation off the main thread (a Web Worker) so the UI doesn't freeze
during range-proof generation. Prove a single proof generating in-browser **in the first days**;
this is the highest technical risk in this half. Record the working config here.

## The payout pipeline (this half's core engineering)

Facts that shape it (details in `../CLAUDE.md` and `../PRODUCT.md` section 7.5):

- A confidential `Transfer` needs **three proofs** (equality, ciphertext-validity, range). They don't
  fit alongside the transfer, so each goes into its own **context-state account**, and the on-chain
  instruction references all three by address.
- A real validator enforces the **1232-byte** transaction limit. Creating a context account and
  populating it with `VerifyProof` must be **two separate transactions**. The Rust litesvm helper
  packs them in one and is **not** a valid template for real clusters. Mirror the TS `client/`
  version.
- Every transfer on a `token_wrap_compliance`-created mint must be proven against the mint's
  **registered auditor pubkey**, or Token-2022 rejects it with `"ElGamal public key mismatch"`.
- Each sender transfer also needs the sender's **new decryptable available balance** (AES), which
  only the key holder can compute.

Pipeline per payroll run (recommended default, decision D3 in `../PRODUCT.md`):

1. **Simulate** (no signing): treasury available balance covers the total, every recipient has an
   activated confidential account, no duplicates or zero amounts, vault not paused. Show the result
   before the admin approves.
2. **Derive keys** (one wallet `signMessage` per session if not already cached).
3. For each recipient: generate proofs, create the three context accounts (create tx, then verify
   tx, each independent so they can run in parallel with a concurrency limit), then send
   `pay_employee` referencing them.
4. After a successful transfer, send `CloseContextState` to reclaim rent (separate transaction).
5. **Track state per recipient** (pending, proofs-ready, sent, confirmed, failed) and **store each
   transaction signature** (the auditor view depends on it), so a failed or
   interrupted run **resumes only the remaining recipients** and never double-pays. Persist run
   state off-chain, keyed by run id, and re-check on-chain state before re-sending.
6. Report progress live in the UI (a payroll of 10 is dozens of transactions).

Balance bookkeeping: the treasury's available ciphertext changes after each transfer, so transfers
from the **same treasury** must be sequenced in a way that keeps the decryptable balance and
equality proof consistent. If parallelizing proof creation, serialize the *transfers* (or compute
balances forward deterministically). Treat this as a design question to verify on devnet early.

## Split payout

A split payout is a batch with N recipients whose amounts come from a rule.

- A rule is off-chain config: destinations and percentages (e.g. 79/20/1). Percentages are
  **client-side policy**; the program cannot verify them (amounts are encrypted). The auditor can
  verify afterward.
- **Rounding:** compute in base units with `bigint`. Give each destination `floor(total * pct)`
  and assign the remainder to the primary recipient so the parts **sum exactly** to the total.
  Unit-test this.
- **Approve then execute.** Status flow: `draft -> pending_approval -> approved -> executing -> done|failed`.
  Nothing moves before approval. If the approver isn't the treasury key-holder, "approved" only
  marks it; the key-holder then opens the app and executes (the keys must be in the browser at
  execution time). For the demo the admin may be both.
- The simulation step must verify **every destination** (including tax-reserve and platform-fee
  wallets) has an activated confidential account.

## Views to build (Phase 1)

- **Admin:** create vault, configure treasury, wrap + fund treasury (USDC -> WUSDC -> confidential),
  manage employee list, run simulation, approve and run payroll with live progress, split payout,
  pause/resume.
- **Employee:** activate (set up a wallet-owned confidential account, employee pays their own fees),
  see own balance and payments (decrypted locally), withdraw/unwrap **with partial amounts as the
  natural default**. Withdrawing sends Token-2022 `ApplyPendingBalance` first as its own call, then
  `withdraw_confidential` (UC2).
- **Auditor:** connect with the auditor key; read the **transaction signatures stored in the run
  history**, fetch each transaction, and decrypt the auditor ciphertext in the `pay_employee` event
  (REQ26). Covers payments made through the app; a chain indexer is Phase 2. See
  `../CLAUDE.md` "Auditor key": the baked-in auditor key is a throwaway whose secret must be
  available, or the mint's auditor must be rotated first.

## Product copy rules (this is in scope, not polish)

- Say plainly that the **transfer is encrypted**, and that **what happens at disclosure
  (withdraw/unwrap) is the user's own choice and responsibility**. Don't imply stronger secrecy
  than the system provides.
- Make **partial and delayed disclosure** the easy path, not an advanced option. Don't default the
  UI to "withdraw everything now".
- The sender's funding side (wrap + deposit) is as public as the recipient's cash-out. Don't present
  the privacy as absolute.
- **Do not build anti-correlation features** (randomized delays, batching-as-obfuscation, mixing).
  That is a decided rejection (`../PRODUCT.md` section 7.4); if asked, point to it instead of
  re-litigating.

## Shared constants (keep in sync with `../programs/vault/src/constants.rs`)

| Thing | Address |
|---|---|
| `vault` program | `ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48` |
| `token_wrap_compliance` program | `9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV` |
| Devnet USDC (classic SPL Token) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| WUSDC (Token-2022, canonical) | `3Qj6ZeyMdytvoTXdRTygJrWAWLaiNEpiYMEVLejY6oPf` |

Keep these in one module (e.g. `src/lib/chain/constants.ts`), read the cluster/RPC from env, and
never hardcode them in components. Devnet only; no mainnet code paths.

## Off-chain data

Employee list, payout rules, approvals, and payroll-run history are **off-chain** (decision 5 in
`../PRODUCT.md`). The database and hosting are **not yet chosen (D6)**. A Postgres + ORM setup or
SQLite is fine for the hackathon; pick one early and record it here. Validate all route-handler
input (e.g. with zod). Never trust a client-supplied "approved" flag without checking it
server-side against the stored state.

## Known current state

- This app **does not exist yet** (the `web/` folder holds only this file). `../client/` was proven only
  against local surfpool. Real devnet transactions from this app are Phase 1 work.
- `pay_employee`, `pause_payroll`, and `resume_payroll` do not exist on-chain yet (auditor rotation is a
  direct Token-2022 call, not a vault instruction); see `../CLAUDE.md`. The vault's instruction set is the
  12 names in the architecture PDF: `initialize_vault`, `configure_treasury_account`, `fund_treasury`,
  `deposit_confidential`, `apply_treasury_pending`, `create_confidential_account`, `wrap_confidential`,
  `unwrap_confidential`, `withdraw_confidential` exist; `pay_employee`, `pause_payroll`, `resume_payroll`
  are coming. Build the UI and pipeline against the existing ones and stub the rest behind a clear
  interface. Don't build against `transfer_confidential`: it is a temporary reference that `pay_employee`
  replaces, and it will be deleted. `create_user_account` no longer exists.
- Decided: employee accounts are wallet-owned, signers pay their own fees, one admin is both
  approver and signer, pause blocks only `pay_employee`. Open decisions that affect this half: D2
  (auditor scope), D3 (batch design), D5 (key-derivation UX), D6 (off-chain store). See
  `../PRODUCT.md` section 9. Don't pick silently; surface them.

## Working style expected on this project

- **"Done" means it works against a real validator**, not that it type-checks or the UI renders.
  Several things here have passed locally and failed on a real cluster (transaction size above all).
  Test critical-path flows on local surfpool or devnet.
- Keep chain and crypto logic in `lib/`, covered by tests where it's pure (split math, amount
  formatting, state machine for runs), and keep components thin.
- Prefer shadcn components and Tailwind utilities; don't add another UI library without asking.
- When something fails with an opaque proof or CPI error, check in this order: auditor pubkey
  mismatch, key derivation `(owner, mint)` mismatch, wrong account order versus the Rust
  instruction, transaction too large, stale or wrong program binary on the target cluster.
- When you finish a piece (a view, a pipeline stage), update "Known current state" here.
- Don't add dependencies lightly: pin versions deliberately. The proof and Token-2022 client
  packages have shipped breaking changes recently; check versions before assuming the code is wrong.
