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
- **`@solana/kit`** for RPC, transactions, signers (installed 2026-10-04 resolved to **8.4.0**, not the v6
  this file used to say; check Token-2022/Codama compatibility before relying on it). **Not** `@solana/web3.js`.
- **Hosting: Cloudflare Workers** via the OpenNext adapter (`@opennextjs/cloudflare`), config in
  `wrangler.jsonc` + `open-next.config.ts`. Edge runtime is not supported; routes run on the Node
  runtime with `nodejs_compat`. **Database: Cloudflare D1 (SQLite) + Drizzle** (decides D6). Schema in
  `src/server/db/schema.ts`; use `getDb()` from `src/server/db` (per request, server-only).
- `@solana-program/token-2022` and `@solana-program/token-2022/confidential` for Token-2022
  instructions and key derivation (`deriveElGamalKeypairForOwnerMint`, `deriveAeKeyForOwnerMint`).
- `@solana/zk-sdk` (official WASM binding) for proofs/encryption, and `@noble/curves` for the
  Ristretto255 point arithmetic the WASM binding doesn't expose.
- **Wallet connection (decided 2026-10-04): `@solana/react@8.4.0` + `@wallet-standard/react@1.0.3`**, pinned. 8.4.0
  matches our `@solana/kit` 8.4.0 (swr and tanstack are optional peers, not installed). `WalletProvider`
  (`src/components/wallet/wallet-context.tsx`) wraps `SelectedWalletAccountContextProvider` (note the prop is
  `filterWallets`, the README says `filterWallet`; keep the filter and `stateSync` at module scope, the provider memoises
  on their identity). Detected wallets must support `solana:devnet` and `standard:connect`. Each wallet row calls
  `useConnect(wallet)` then `selectAccount(accounts[0])`. Only `walletName:address` is persisted (localStorage), never keys or
  signatures. Key derivation is live: `WalletKeyProvider` uses `useSignMessage`. For transactions use
  `useWalletAccountTransactionSigner` /
  `useSignAndSendTransaction` for transactions, both taking `useWallet().account`.
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
bun run preview      # opennextjs-cloudflare build + run on local workerd (closest to prod)
bun run deploy       # build + deploy to Cloudflare (needs `wrangler login`)
bun run db:generate  # drizzle-kit: schema.ts -> SQL migration in drizzle/
bun run db:migrate:local   # apply migrations to local D1 (needed once before `bun run dev` shows saved data)
bun run db:reset:local     # wipe the LOCAL D1 and re-apply (stop `bun run dev` first, then restart it)
bun run db:list:local      # which migrations are applied (db:list:remote for prod)
bun run db:create          # first time only: creates the REMOTE D1 (needs `wrangler login`); paste the printed database_id into wrangler.jsonc
bun run db:migrate:remote  # apply migrations to the remote D1 before deploying
bun run db:shell:local -- "SELECT ..."   # run one SQL statement (db:shell:remote for prod)
bun run cf-typegen   # regenerate cloudflare-env.d.ts after editing wrangler.jsonc
bun run gen:vault    # regenerate src/generated/vault from ../target/idl/vault.json (Codama); see below
```

Setup notes: `bun pm trust esbuild workerd` was needed (blocked postinstalls). Before the first
deploy, run `bunx wrangler d1 create vault-web` and paste the `database_id` into `wrangler.jsonc`
(currently a placeholder). Never run `opennextjs-cloudflare build` concurrently: it corrupts
`.open-next/` (duplicate exports in `next-env.mjs`); `rm -rf .open-next` fixes it. Copy
`.env.example` to `.env.local` for the RPC URL.

**Generated vault client (done 2026-10-05):** `bun run gen:vault` runs `scripts/generate-vault-client.ts`
(`codama@1.11.0`, `@codama/nodes-from-anchor@1.5.6`, `@codama/renderers-js@2.5.0`, dev deps) on `../target/idl/vault.json` and
writes `src/generated/vault/` (never hand-edit; eslint ignores it; import from `@/generated/vault/src/generated`). Run it after
the on-chain half changes anything (root order: `anchor build`, then `cargo build-sbf --arch v1` last). It gives account
decoders (`fetchMaybeVault`), PDA finders (`findVaultPda({ admin, mint })`), instruction builders and event decoders.
Env: `NEXT_PUBLIC_SOLANA_RPC_URL` (devnet; defaults to the public RPC, which rate-limits). Record here, as they get decided:
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
5. **Derive keys with the standard wallet-level derivation** (`deriveConfidentialKeys` from
   `@solana-program/token-2022/confidential`, changed 2026-10-05; this rule used to say per `(owner, mint)`).
   The wallet signs the constant `solana-conf-bal/v1` once; the ElGamal keypair and AES key both come from that one
   signature, byte-identical to what the Rust `solana-zk-sdk`, the CLI and other clients derive for the same wallet. The
   per-`(owner, mint)` helpers are deprecated in 0.19.0 and exist only to migrate old accounts. Consequence: one key
   per wallet, so the treasury account and the same wallet's personal account share a key. If proofs fail with opaque
   errors, check derivation first. The wallet must sign **canonically and deterministically** (Ed25519, RFC 8032) and must
   not rewrite the message; the app rejects a rewriting wallet and warns if the public key changes between sessions
   (`checkKeyContinuity`, stores only the public key).

## Where the WASM bites in Next.js

`@solana/zk-sdk` is WASM. Expect to need: client-only dynamic import, WASM support enabled in the
bundler config (check whether the app uses Turbopack or webpack and the current Next.js docs for
async WASM), and proof generation off the main thread (a Web Worker) so the UI doesn't freeze
during range-proof generation. Prove a single proof generating in-browser **in the first days**;
this is the highest technical risk in this half. Record the working config here.

**Verified 2026-10-05:** with `next.config.ts` left empty, Turbopack bundles `@solana/zk-sdk` (the `bundler` wasm-pack
target, pulled in by `@solana-program/token-2022/confidential`) and it instantiates and runs in the browser. Key
derivation ran in headless Chrome against `next dev`. Keep the import lazy (`await import(...)` inside `lib/crypto/keys.ts`)
so the WASM only loads client-side on demand. Not yet checked: the Cloudflare Workers production build (`bun run build` /
`preview`), and proof generation (heavier) on the main thread vs a Web Worker.

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

Employee list, payout rules and payroll-run history are **off-chain** (decision 5 in `../PRODUCT.md`) and, for real wallets, live in
**Cloudflare D1 via Drizzle** (decided D6, wired 2026-10-05). Demo wallets keep using the in-memory mock store.

- **Schema** (`src/server/db/schema.ts`, migration in `drizzle/`): `addresses` (renamed from `employees` 2026-10-07, migration `0002`: columns `id, employer, name, wallet, created_at`; `role` and `amount` were dropped, amounts are now chosen per run), `payrolls` + `payroll_entries` (added 2026-10-07, migration `0003`: a named list of (saved address, amount per run); the same address can be in many payrolls at different amounts; an address that is in a payroll cannot be deleted, the API answers 409 naming the payroll), `payroll_runs` (now has a nullable `payroll_id`, set null if the payroll is deleted so history stays), `payroll_run_items`, plus `auth_nonces` and
  `sessions`. Everything is keyed by `employer` = the admin wallet. Amounts are base-unit strings. No keys, ever.
- **Auth = one wallet signature, then a session.** `POST /api/auth/nonce` returns the exact message to sign (site, wallet, single-use
  nonce, 5-minute expiry; built by `lib/auth/message.ts`), the wallet signs it with `signMessage`, `POST /api/auth/verify` rebuilds the
  message server-side, verifies the Ed25519 signature (`lib/auth/verify.ts`, WebCrypto), burns the nonce and sets an httpOnly `cp_session`
  cookie (7 days). **Only the SHA-256 of the cookie token is stored** and there is **no server secret**, so nothing to put in `.dev.vars`.
  This is a second, separate signature from key derivation (that one is never sent anywhere).
- **Every route takes "who is calling" from the session only** (`getSessionAddress`), never from the body: the zod schemas are `.strict()`, so
  a client that sends `employer` gets a 400. Routes: `GET /api/company` (`addresses` + runs), `POST /api/addresses` (`{name, wallet}` only), `DELETE /api/addresses/[id]` (409 while it is in a payroll), `POST /api/payrolls` (`{name, entries:[{addressId, amount}]}`, every address must be the caller's own, no repeats, amounts positive; payroll + entries in one batch), `DELETE /api/payrolls/[id]`,
  `POST /api/runs` (totals and counts computed server-side; run + items written in one batch), `/api/auth/{nonce,verify,session,logout}`.
- **Client:** `components/data/payroll-data.tsx` (`PayrollDataProvider`, `usePayrollData`) loads on connect and exposes `signIn`, `addAddress`,
  `removeAddress`, `addPayroll`, `removePayroll`, `recordRun(label, items, payrollId)`. A wallet that has not signed in sees `PayrollGate` ("Sign in with wallet") on Addresses / Run payroll /
  Split, and an inline prompt for run history on the Overview. Disconnect also calls `/api/auth/logout`. `useVault()` merges this data over the
  chain-derived vault flags (`vault.employees` = saved addresses, `vault.payrolls` = payrolls with amounts); `ChainProvider` checks activation for the persisted employees.
- **Payrolls (2026-10-07).** Run payroll now starts from a payroll: `components/app/payroll-picker.tsx` has `PayrollPicker` (choose, delete) and `AddPayroll` (a sheet:
  name, then rows of saved-address dropdown + amount, one submit). The page maps the chosen payroll's entries to the run engine's recipient list, so the engine is
  unchanged; a run is saved with its `payrollId`. Demo wallets get the same flow from the mock store (seeded with one payroll). Verified against the running dev
  server + local D1 with throwaway wallets (valid create, same address in two payrolls, duplicate / foreign address / zero amount / no entries / extra field / no session
  rejected, address delete blocked then allowed, payroll delete keeps the run, other wallets can't see or touch them). **Not browser-run.** Remote D1 needs `bun run db:migrate:remote`.
- **Verified** (devnet-forked surfpool + local D1, real UI): one wallet prompt to sign in, 401 before / 200 after, rows survive a reload with no
  second prompt, duplicate wallet 409, extra `employer` field 400, bad address / amount / signature 400, remove works, run history shows
  after reload, logout ends the session, DB rows are scoped to the signing wallet and sessions hold only a hash. Unit tests cover the message
  and signature verification (tamper, wrong wallet, wrong site, wrong length).
- **Known gaps before real users:** (the nonce rate limit is done, see "Hardening" below); a run is saved only when it finishes completely (payments from a
  partly failed run are on-chain but not in history until the indexer reconciles); no edit-payroll endpoint yet (delete and recreate); cookie is `Secure` only in
  production builds; CSRF relies on `SameSite=Lax` (cross-site POSTs carry no cookie).
- **Deploy:** `bun run db:create`, paste the id into `wrangler.jsonc`, `bun run db:migrate:remote`, then `bun run deploy`. The first deploy
  also needs `NEXT_PUBLIC_SOLANA_RPC_URL` set in the BUILD environment (it is inlined into the browser bundle).

## Indexer plan (decided 2026-10-04, build when wiring devnet)

Goal: later, the auditor reads payments quickly from D1 instead of scanning the chain, and direct contract calls
(not made through this app) are still captured. Independent of how the auditor is set up (that is being reworked).

- **Source of truth is the chain.** A Cloudflare Worker syncs from a dedicated devnet RPC (not the public one).
  `getSignaturesForAddress(vault PDA)` returns every `pay_employee` (the vault is in its accounts), app-made or not.
  Keep a per-vault cursor (last indexed signature) in D1; `getTransaction` only for newer signatures.
- **Triggers:** on-demand sync first (when admin/auditor opens a page, and right after the app sends a run), then an
  optional Cron Trigger every 1 to 2 minutes. No hosted webhook vendor for now; it can be added later without changing the table.
- **Decode from instruction data, not logs** (logs can truncate; the ciphertexts are in the args too). Use the
  IDL-generated decoder, so a contract change only means regenerating it. Store ciphertexts as opaque bytes.
- **Who writes what:** the app writes only metadata (run id, recipient name, planned recipient, signature). The indexer
  writes the ciphertext lo/hi, slot and block time from the chain and marks the row confirmed. Never take ciphertext
  from the browser. Direct calls appear with `source = 'chain'` and no run/name.
- **Table sketch (`payments`):** `signature` PK (idempotent upserts), `vault`, `employee`, `employee_token_account`,
  `auditor_ct_lo`, `auditor_ct_hi`, `slot`, `block_time`, `run_id` nullable, `source` ('app' | 'chain').
- **Access control is required before this holds anything real:** the table has names and wallets, so API routes need
  wallet-signature auth and scoped reads. Keys and decrypted values never go in the DB; decryption stays in the browser.
- Decided scope notes: one vault per admin wallet (vault PDA = vault seed + admin + WUSDC mint; multi-company means
  connecting another wallet). The auditor UI and contract linkage are deferred and will be reworked later.

## Known current state

- **Scaffolded 2026-10-04**: Next.js 16.3.8 (App Router, `src/`, Turbopack, Tailwind 4), shadcn/ui
  initialised (only `button` added), Cloudflare/OpenNext + D1/Drizzle wired and verified (lint,
  typecheck, OpenNext build, local D1 migration, 200 from `wrangler dev`). The home page is a
  placeholder. **UI pass 2026-10-04 (mock data, not wired):** Daylight Ledger design (see `DESIGN.md`):
  landing `/`, admin `/admin`, `/admin/employees`, `/admin/payroll`, `/admin/split`, employee `/employee`,
  `/employee/withdraw`, auditor `/auditor` (route group `src/app/(app)`), with encrypt/decrypt motion
  components in `src/components/crypto/`. Mock data in `src/lib/mock/data.ts`; `useRunSimulation`,
  `useStepper`, `KeyProvider` and `EmployeeProvider` are stand-ins to replace with the real pipeline,
  wallet signMessage key derivation and chain reads. Lint, typecheck, `bun test` (split math) and the
  OpenNext build pass; **not yet checked visually in a browser** (the Chrome extension could not reach
  localhost). Brand name "Cipherpay" is a placeholder. **Not done yet:** wallet library (still to pick), Codama client generation, the
  zk-sdk WASM proof spike (bundler config is deliberately empty), auth for API routes, and the
  Workers bundle-size check once the Solana/zk deps are actually imported. `../client/` was proven only
  against local surfpool. Real devnet transactions from this app are Phase 1 work.
- **Mock alignment pass 2026-10-04 (still no chain):** the app opens on a **wallet connect gate** (`/app`). There is
  **one portal for members**: the nav always has **My pay** (default landing, `/pay`: balances, payments, Withdraw
  sheet) and **Company** (`/admin`). Company opens the "Set up your payroll vault" flow; only once the vault and treasury
  are configured do Overview, Employees, Run payroll and Split payout appear. Those URLs are closed until then: the shell
  redirects `/admin/*` (other than `/admin`) to `/admin` for a wallet whose company is not set up. The auditor stays a separate view (`/auditor`, key imported not
  wallet-derived; deferred rework). Real wallet connect is live (see Stack); demo wallets in
  `lib/mock/wallets.ts` remain as a secondary "sample data" option until the mock store is replaced by chain reads. Mock backend is
  `lib/mock/store.tsx` (vaults, accounts, runs; actions named after the instructions). Done in the mocks to match the
  contract: first-run vault setup (`initialize_vault` + `configure_treasury_account`), **serialized** transfers in the
  run engine (D3) with per-recipient failure + retry-failed-only, paused/treasury/authority checks in the simulation,
  SOL requirement for anything a wallet signs, withdraw shows its two proofs and leaves WUSDC unless unwrapped, per-payment
  list sourced from the employer record. The demo failure toggle is on the payroll review step. Not browser-verified
  (extension cannot reach localhost); lint, typecheck, tests pass and all routes return 200.
- **Payroll (`pay_employee`) is real (2026-10-05).** For a real wallet, Run payroll pays each recipient in turn through
  `lib/chain/pay-run.ts` (`payOne`), driven by `lib/payroll/use-live-run.ts` (same return shape as the demo engine
  `useRunSimulation`, so the page swaps engines on `v.isLive`). **Per recipient: six transactions, but the wallet approves only ONE (changed 2026-10-06).** (1) create the 3 proof context accounts,
  (2-4) verify equality / ciphertext-validity / range proofs, one tx each, (5) `pay_employee` (+ compute-budget 400k), (6) close the 3
  contexts. Steps 1-4 and 6 are signed silently by a **payroll helper key** (`lib/chain/helper-signer.ts`: derived one-way from the
  wallet's ElGamal secret, so the same wallet always gets the same helper and leftover SOL is recoverable; holds only ~0.008 SOL; the wallet
  tops it up when short, which is the one extra prompt, and it is swept back when a run completes). Only step 5 needs the admin wallet
  (the program requires `admin == Vault.authority`; it does not care who created the proof accounts). `lib/chain/pay.ts` builds them (a unit
  test asserts every one is under the real 1232-byte limit and that the admin is not in any helper transaction), `lib/chain/transfer-proofs.ts`
  composes the proofs (port of `client/src/lib/confidentialTransferProofs.ts`, using `@noble/curves` ristretto255 for the two ciphertext
  operations zk-sdk lacks; tests verify all three proofs and that the auditor ciphertexts decrypt to `lo + hi*2^16`). **Why not one batched
  approval (what we first built):** a wallet asked to sign six transactions at once is slow to show its popup (it simulates each, and five
  depend on accounts that don't exist yet), and all six shared one blockhash, so a slow approval closed the window. `@solana/react`'s
  `useWalletAccountTransactionSigner` also THROWS (`WALLET_MULTISIGN_UNIMPLEMENTED`) for more than one transaction. **Gotchas:**
  (a) the proof must be built against the treasury's CURRENT available ciphertext, so state is read fresh per recipient and recipients are
  strictly sequential (D3); (b) the mint's auditor key is read from the mint, never hard-coded. **Retry semantics:** `PaymentError.maybePaid` is true only when
  `pay_employee` was submitted and could not be confirmed either way (expired / unknown): the row says "check before retrying"; a
  decline or preflight rejection means nothing moved, so "Retry failed" only re-runs failed recipients and confirmed ones are never
  touched. If the close step fails the payment still counts and the row shows a warning (rent stays locked in the contexts).
  **Verified** on a devnet-forked surfpool through the real UI (admin in the browser; two employees activated by script with our own
  lib code): setup, fund 6, add two employees, simulate, approve and run, 4 wallet requests total, treasury 6.00 -> 2.25 and employees
  decrypt to exactly 1.50 and 2.25 pending; and a failure run (wallet declines the 2nd approval): 1 confirmed, 1 failed, Retry pays only
  the failed one, final balances exact (no double payment). **Not verified:** a real wallet app's batch `signTransaction` (Phantom should
  map multiple inputs to one `signAllTransactions` approval, unconfirmed); blockhash lifetime if the user sits on the approval for more
  than ~60-90s (the run fails safely with "expired", nothing sent); leftover context accounts if a run dies after step 1 (rent only, not yet
  auto-closed). Split payout is real too (see the entry below). Pause/resume is real (see the employee-side entry below).
- **Employee side is real: apply pending, withdraw, unwrap (2026-10-06), and pause/resume.** `lib/chain/receive.ts` builds Token-2022 `ApplyPendingBalance`
  (the library helper reads the pending-credit counter and AES-encrypts available + pending), `vault::withdraw_confidential` and `vault::unwrap_confidential`;
  `lib/chain/withdraw-proofs.ts` composes the two withdraw proofs (equality + 64-bit range; port of the client's `withdrawProofData`, tested to verify
  for partial, tiny and full amounts); `lib/chain/withdraw-run.ts` (`withdrawOnce`) runs it. **Wallet approvals: ONE for [helper top-up if short +
  apply pending] and ONE for [withdraw + unwrap in the same transaction]** (the two proof accounts are created, verified and closed silently by the same
  derived **helper key** as payroll, so a slow wallet popup can only delay a step). The proof is built against the account AFTER the apply lands (apply
  changes the available ciphertext). Employees' helper is topped up to 0.010 SOL when under 0.008 (`WITHDRAW_HELPER_*`), not swept (same key as the
  admin's helper, which may be the operator). Hooks: `components/chain/use-receive.ts` (`useApplyPending`, `useWithdraw`); the My pay Apply button and
  the Withdraw sheet use them for real wallets (the sheet freezes amount and steps once started, and unfreezes on error). Pause/resume:
  `lib/chain/pause.ts` + `use-pause-payroll.ts`, surfaced as `useVault().setPaused` (now async, resolves true on confirmation) and `pauseBusy` / `pauseError`;
  one admin wallet approval, no keys needed. **Verified on a devnet-forked surfpool through our own lib code (throwaway keypairs; NOT through the
  browser UI):** setup, fund 10, activate, pay 4.00, standalone apply, pay 1.00 more, withdraw 1.25 + unwrap (stages prove > apply > prove > create > verify
  > withdraw > close, helper top-up path included): confidential 3.75, plain USDC 1.25, proof accounts closed; withdraw 0.50 without unwrap leaves 0.50 public
  WUSDC; over-withdraw refused up front; pause on-chain, payment refused while paused, **employee withdraw still works while paused**, resume, payment works.
  Tests: `withdraw-proofs.test.ts`, `receive.test.ts` (accounts, who signs what, every transaction under 1232 bytes including withdraw + unwrap),
  `pause.test.ts`. **Not done:** the per-payment history list (needs the indexer; the chain only holds the combined balance and the payment event is encrypted for
  the auditor, not the employee), a browser run of the new UI, and a real wallet app.
- **Per-payment history and real split payout (2026-10-06).** **History:** `GET /api/payments` (`src/app/api/payments/route.ts`) returns the confirmed
  `payroll_run_items` whose RECIPIENT is the signed-in wallet (session only, never a parameter; new index `payroll_run_items_recipient`, migration
  `0001`, run `bun run db:migrate:local` / `db:migrate:remote`). `PayrollData` now exposes `payments`; `useEmployee()` maps them (title = run label, "from"
  = employer address, explorer link). An employee who has never signed in sees a "Sign in with wallet" prompt (the same one-signature session as the employer).
  **These are employer-recorded amounts, not chain-verified** (the chain holds only the combined balance and the payment event is encrypted for the auditor):
  an employer could record a payment that never happened, which is why every row carries its transaction signature and the page says so. Real indexer
  stays Phase 2. Verified against the running dev server + local D1 with 3 throwaway wallets: 401 without a session, each wallet sees only payments addressed
  to it, failed items and signature-less items are excluded, the employer sees none. **Split:** the page runs the real engine (`useLiveRun`, the same `payOne`
  as payroll, strictly sequential) for real wallets; the destinations are typed-in wallets (see the next entry), their activation is read with `readActivation`, the Automatic payroll switch
  is on the page, a failed destination can be retried (`Retry failed`), and the run is saved to history like payroll. Destinations are NOT persisted (React
  state only; a saved split rule is a later feature). Verified on a devnet-forked surfpool through our own lib code: 10.00 at 79/20/1 -> 7.90 / 2.00 / 0.10
  decrypt exactly, treasury drops by exactly 10.00, an unactivated destination is refused before anything moves. **Not browser-run.**
- **Hardening (2026-10-07): sign-in rate limit and the proof worker.** **Rate limit:** `POST /api/auth/nonce` and `/api/auth/verify` are the only routes that
  need no session, and the nonce route wrote to D1 on every call. They now go through `server/rate-limit.ts` (`rateLimited(request, scope)`): a Cloudflare
  Rate Limiting binding `AUTH_LIMITER` (`wrangler.jsonc` `ratelimits`, 20 requests per 60 s, per client IP from `cf-connecting-ip`, separate bucket per route;
  Cloudflare only offers 10 s or 60 s windows). Over the limit = `429` + `Retry-After: 60` and a plain message the sign-in UI already shows. If the binding is
  missing, development carries on but PRODUCTION refuses with 503 (a limit that silently stops applying is worse than a visible outage). The expired-nonce
  and expired-session sweep no longer runs on every nonce call, only about one call in twenty (`SWEEP_CHANCE`; both lookups check expiry anyway); a cron
  trigger would be the alternative but needs a custom Worker entry. **Not done:** a cap on unused nonces per address, and limits on the session-gated routes.
  Verified locally (miniflare binding, scratch copy): 20 x 200 then 429s with `Retry-After`, and `verify` is not starved by a nonce flood. The shared-NAT case
  (a whole office behind one IP) can hit 20 a minute; raise `limit` if that happens. After changing `wrangler.jsonc` run `bun run cf-typegen`.
  **Proof worker:** `lib/crypto/proof-worker.ts` runs the three heavy WASM jobs (transfer proofs, withdraw proofs, balance decryption) off the main thread;
  `lib/crypto/proof-client.ts` (`proveTransfer`, `proveWithdraw`, `decryptOffThread`) is the page's side and `proof-protocol.ts` the messages. `decrypt.ts` is now a
  thin off-thread wrapper over `decrypt-local.ts` (the pure version the worker runs); `pay.ts` and `receive.ts` call the client. **Keys:** each request sends the
  secrets it needs as a structured-clone COPY (the page's keys are untouched), the worker keeps nothing between requests and zeroes what it was handed in a
  `finally`. If a worker can't be created or its script fails to load, the client gives up on workers for the page and runs the work on the calling thread (a
  stutter, not a failure); real errors from the work (wrong key, amount too large) are returned as errors, never retried. `proofWorkerStatus()` exposes
  `{running, broken}`. **Measured in headless Chrome against the real Turbopack bundle, dev AND production build:** withdraw proof blocked the main thread
  ~75 ms on the main thread vs 0 ms on the worker; balance decrypt ~480-535 ms vs 0 ms (production; ~68 ms in dev mode); wall time per call is about the same.
  Transfer proofs (the heavier ones) were not separately measured, they use the same mechanism. `next.config.ts` still needs no change. Tests:
  `proof-client.test.ts` (worker really used, caller's keys not zeroed, WrongKeyError type preserved, proofs verify, errors propagate). **Gotcha found on the way:**
  a STATIC import of `@solana-program/token-2022/confidential` (or `@solana/zk-sdk`) anywhere in a module a page imports breaks `next build` prerendering
  (`ENOENT ... zk-sdk/dist/node/index_bg.wasm`) while `next dev` hides it; keep those imports lazy (`await import`) and run `next build` after touching imports.
- **Split payout is a rule the admin writes (2026-10-07).** No more fixed three destinations. The admin adds up to `MAX_SPLIT_ROWS` (10) destinations, each with a
  name, a wallet and a percentage (0 to 100, up to 2 decimals), picks one **primary** (it absorbs the rounding remainder and must be above 0%), and can remove rows.
  Pure logic in `lib/payroll/split-plan.ts` (`parsePercentBps`, `checkSplit`, `toDestinations`, `splitRunItems`, `checkSplitWallets`), 14 tests: a rule must add up to
  exactly 100%, every row needs a name (the server's 80-character limit), a valid and distinct wallet and a readable percentage; a 0% destination is not paid. Real wallets
  start from their first payroll recipient at 100%; the demo starts from its three sample wallets (demo checks only "filled in and distinct", its wallets are not real
  addresses). The page (`admin/split/page.tsx`) shows the unassigned / over-100% amount live, reads activation for ALL typed wallets in one batched call, and Approve explains
  in words why it cannot go ahead (and highlights the fields) instead of being a dead button. **Not persisted:** the rule lives in page state; saved split presets
  (a D1 table) are the obvious next step. **Verified:** (1) on a devnet-forked surfpool through our own lib code: 5 destinations (50.5 / 25 / 12.25 / 12.25 / 0 %, the primary
  is the 3rd row) of a 7.777777 invoice, 4 payments, each holds exactly its part (the primary got the 2 extra base units of rounding), the 0% one holds nothing, the
  treasury fell by exactly the invoice; (2) in headless Chrome in demo mode: edit a percentage, see "9% left to assign", add a 4th destination, name/wallet errors, a
  duplicate wallet flagged, remove a row (the primary moves), then approve, unlock keys and execute a hand-built 4-destination rule to completion. The real-wallet
  version of the page was not clicked through in a browser (no wallet extension); its engine is the same one the chain test used.
- **The slow-wallet-popup investigation, 2026-10-06 (measured; it is NOT the front end).** Symptom: Phantom's popup appears ~30-40 s after the
  request, so the transaction's ~39 s window has closed by the time it is approved; intermittent, worse after a session has been running a while.
  **Measured in headless Chrome with the real UI instrumented** (main-thread lag probe, PerformanceObserver longtask, hooked `WebAssembly.instantiate`,
  hooked `fetch`, live-interval census): idle on `/admin/payroll` = **1-4 ms** max main-thread lag, 0 long tasks, 2 intervals, WASM heap flat at
  **10 MB**, JS heap 27 MB; **click on the switch -> the wallet received the sign request in 18 ms**. 300 consecutive balance decrypts in Bun did not
  grow RSS at all (wasm-bindgen registers finalizers), and one decrypt costs a flat **~370 ms** regardless of the amount (it is not a value-dependent
  DLog search). So nothing in our page accounts for a 30-40 s delay. **What does:** `api.devnet.solana.com` was returning **HTTP 429 "Too many requests
  from your IP" to every single request** from this network, and one account read through a public-devnet-backed endpoint took **52 s**. A wallet
  simulates on ITS OWN RPC (our `NEXT_PUBLIC_SOLANA_RPC_URL` does not apply to it), and Phantom's default devnet RPC is the public one, so a
  rate-limited IP delays the popup by exactly this much. **Fix for the user:** point the wallet at a dedicated devnet RPC (Phantom: Settings ->
  Developer Settings -> Solana devnet RPC). **Note for us:** a devnet-forked surfpool pulls accounts through public devnet and burns that same shared
  IP quota, so running these e2e tests makes the browser wallet slower on the same network. **Structural fix if it must not matter:** a durable nonce
  for the wallet-signed transaction (then it never expires); untested with Phantom, which may warn on nonce transactions.
- **Front-end work done anyway from that audit (2026-10-06).** Real but smaller costs, all fixed: (a) **WASM objects we allocated were not freed** -
  `.pubkey()`, `.encrypt()` and friends each return a NEW wasm object, so `key-registration.ts`, `pay.ts` and `fund.ts` now free the returned
  ciphertext/pubkey, not just its owner; (b) **polling no longer runs while a wallet approval is open** - `send.ts` exports `walletPromptOpen()` /
  `onWalletPromptChange()` (a counter around the wallet call), and `chain-state.tsx` skips its tick and catches up afterwards, because a wallet popup
  does NOT hide the page, so the 6-call poll and its decrypt used to fire exactly while the wallet was opening; (c) **one decrypt shared between
  consumers** - `useVault()` and `useEmployee()` each created their own `useConfidentialBalance` for the same account (2-3 identical 370 ms decrypts),
  now deduped by ciphertext key in `use-confidential-balance.ts`; (d) the operator panel's **1 s countdown clock only runs while something is counting
  down**. Proof generation and decryption used to run on the **main thread** (~5 long tasks per payroll run, max ~340 ms); that is fixed, see "Hardening" below. Known and NOT fixed: `@solana-program/token-2022`'s own `decryptConfidentialTransferBalance` leaks 3 wasm objects per
  call inside `node_modules`; `useVault()`/`useEmployee()` still return fresh object literals every render.
- **The admin signs a MESSAGE, not a transaction, to turn automatic payroll on or off (2026-10-06).** This is the fix for the slow-wallet
  problem below. `lib/chain/authorization.ts` builds the exact text the admin signs (`authorizationMessage`, which **must match
  `authorization_message` in `../programs/vault/src/instructions/authorize_operator.rs` byte for byte** -- both sides pin the literals in
  tests) and Solana's Ed25519 precompile instruction (`ed25519VerifyInstruction`); `buildAuthorization` asks the wallet via `signMessage`,
  checks the wallet returned the text unaltered, and returns `[Ed25519 verify, authorize_operator]` **paid for and signed by the payroll
  helper**. `authorizeHelper` / `revokeAndReclaim` in `helper-signer.ts` wrap it; the panel calls them. Why it works: a signed message has
  no ~40 s validity window and nothing for the wallet to simulate, so a slow popup cannot invalidate it. `signMessage` reaches components
  through `useTxSigner()` (passed down from `WalletKeyProvider`, which already holds the wallet's `useSignMessage`). The replay counter
  `seq` is read from `OperatorConfig` as late as possible; `readOperator` returns it. **Verified on a devnet-forked surfpool with a wallet
  deliberately made 92 s slow: the authorization still succeeded** (0 transaction signatures, 1 message signature), the payroll run then
  needed 0 wallet interactions of any kind, and turning it off with a 60 s slow wallet also succeeded (1 message signature), clearing the
  operator on-chain and returning the helper's SOL. **The one wallet-signed transaction left is topping the helper up with SOL**
  (`topUpHelperIfShort`), which is deadline-bound like any transaction but now rare: the helper holds ~0.022 SOL
  (`HELPER_TOPUP_LAMPORTS`, raised because the helper also pays the one-off rent for the `OperatorConfig` account it creates), it is not
  swept after a run, and funding the treasury tops it up in the same transaction. **Needs the devnet program upgraded** (new instruction,
  and the config PDA seed moved to `operator_v3`, so any earlier devnet authorization is ignored).
- **Automatic vs manual payroll (2026-10-06).** The Run payroll page has an **Automatic payroll** switch (`components/app/operator-panel.tsx`).
  **Turning it ON asks the wallet right then** (a SOL top-up only if the helper is low, then the authorization itself, which since the entry above is a SIGNED MESSAGE, not a transaction), so a slow wallet popup happens before the run, not during it; the switch only flips on after that confirms. While on, a live
  **countdown (m:ss) and "N payments left"** show, and a run is signed entirely by the helper: no popups. The admin picks, before turning it on,
  how long it stays on (**1, 5 or 15 minutes**, default 5; the program allows at most 24 h) and a payment cap (at least the people in the run;
  amounts are encrypted, so the program caps the COUNT, not the value). A short window shows a warning when the run may need longer (we assume
  roughly 30 s per person on devnet; that figure is an estimate, not measured precisely). **The switch mirrors the chain** (`readOperator`, polled
  every 20 s): it is on exactly while an authorization is live, and flips off by itself (with a toast) when the time or the payments run out.
  **Turning it OFF = revoke and reclaim**: the admin signs a revoke MESSAGE, then the helper's SOL is swept back silently. If a
  run starts while it is off, it runs **manual**: the admin's wallet approves every `pay_employee` (the helper only does the proof accounts and is
  topped up when short). A "Reclaim SOL" button appears when the helper still holds SOL while off. The helper holds ~0.011 SOL
  (`HELPER_TOPUP_LAMPORTS`; 3 proof accounts cost ~0.0063 SOL of rent on devnet and ~0.0086 on surfpool, refunded on close). `OPERATOR_MARGIN_SECONDS`
  is 10 s (a payment doesn't start on an authorization about to lapse). **Contract:** `main`, **deployed to devnet 2026-10-06** (`set_operator(operator,
  expires_at, max_payments)`, PDA `["operator_v2", vault]`, `OperatorLimitReached`). **Slow popup root cause (earlier saga):** the Helium browser
  (Phantom popup ~40 s there, instant in Chrome). **Verified** on a devnet-forked surfpool through the real UI: ON = 1 wallet request, timer
  4:45 and 3 payments; automatic run = 0 requests, exact balances, timer running (4:06 -> 4:03), 1 payment left; OFF = 1 request, chain operator
  cleared, helper SOL 0; manual run = 3 requests (1 top-up + 2 payments), operator stays cleared. Also confirmed by the user on real devnet.
- **Send errors and blockhash handling (2026-10-06).** A payment failed on a real network with only "The network rejected the transaction
  before sending it". Cause of the vagueness: for a rejected preflight, kit puts the real reason in **`error.cause`** (e.g. "Blockhash not
  found") and the `context.logs` are EMPTY in that case, so a log-only message says nothing. `toTxError` (`lib/chain/send.ts`) now keeps
  `cause.message` and picks the explanatory log line (`failingLogLine`, skips the generic "Program X failed"). `TxError.submitted` says whether
  the transaction may have reached the network (false = declined / rejected by preflight / expired before sending, so retrying is safe).
  Fixes: (1) a rejected preflight is retried up to 6x (1.5s apart) ONLY for "Blockhash not found" (a load-balanced RPC can hand out a
  blockhash from a node ahead of the node that checks the send), resending the same signed tx; if the block height has passed
  `lastValidBlockHeight` it stops with "approval window closed, nothing was sent"; (2) `getFreshLifetime` asks the RPC again (up to 5x) when the
  first blockhash has under 120 blocks of life left (some providers cache or lag), and `signAndSend` times the wallet and appends
  "the blockhash had N blocks of life when fetched, about S s, and the wallet took W s to sign" to a closed-window error so a slow wallet and a
  stale RPC can be told apart; (3) `maybePaid` follows `TxError.submitted` instead of guessing. **Measured on public devnet (2026-10-06): blocks
  arrive at ~3.8/s, so the 150-block validity window is only ~39 SECONDS (not 60).** That is tight for a wallet popup plus a human, for any
  wallet-signed transaction, so keep wallet-signed transactions few and simple. If slow wallets keep tripping it, the real fix is a durable
  nonce for wallet-signed transactions (untested with Phantom, which may warn on nonce transactions) or, better, a contract change that lets the
  admin authorize an operator key so payroll needs no per-payment wallet prompt (fits the planned auditor/contract rework). Verified on a devnet
  fork: a wallet taking 12s works, one taking 75s stops with the numbers and nothing sent.
- **Slow wallet popup, 2026-10-06 (unresolved root cause).** A user's wallet showed its popup ~30 s after the request and then took ~9 s to enable
  Confirm, every time: a steady ~39 s, equal to devnet's window (measured: ~3.8 blocks/s, 150 blocks), so every wallet-signed transaction
  expires. The blockhash was fresh (149-150 blocks) so it is not a stale RPC. Leading guess: wallets simulate on THEIR OWN RPC node and retry
  while it does not know our blockhash (our dedicated RPC may be ahead of the wallet's node), or the wallet's network is not devnet. Steps taken:
  first attempt now takes a `finalized` blockhash (`ATTEMPT_COMMITMENT` in `lib/chain/send.ts`; every node knows it; public devnet showed no
  life cost), fallback `confirmed`; automatic re-ask limited to ONE retry (`retryOnExpiry = 1`, a steady wallet delay only gets worse with more
  popups); a live countdown on the row (`WalletCountdown`); the error ends with the blockhash life, the wallet's seconds and the commitment used.
  To discriminate: try the public RPC (remove `NEXT_PUBLIC_SOLANA_RPC_URL` from `.env.local`), check the wallet is on Devnet, and note any
  warning the popup shows. If it persists the real fixes are (a) a durable nonce for wallet-signed transactions (the one-time nonce-creation
  transaction is itself blockhash-bound; Phantom may warn on nonce transactions; untested) or (b) a contract change letting the admin authorize
  an operator key so payroll needs no per-payment wallet prompt. Test-harness note: payroll e2e scripts must click "Sign in with wallet" first
  now (the page is behind `PayrollGate`), or they wait forever for "Simulate run".
- **Logout fix (2026-10-05).** `disconnect()` in `wallet-context.tsx` now deletes the saved `cipherpay:wallet-account` key itself and drops the
  selection first, then asks the wallet to deauthorize with a 3s timeout. Cause: `SelectedWalletAccountContextProvider` only deletes the saved
  key from an effect that runs when the selection *changes*; after a reload the library can already have cleared the selection (the wallet
  reported no accounts), so `setSelected(undefined)` changed nothing, the key stayed, and a wallet that re-lists the site's account on load
  (Phantom-style trusted site) was restored on the next refresh. Reproduced and verified with a fake wallet that repopulates accounts on load.
- **Fund treasury is real (2026-10-05).** `useFundTreasury` (`components/chain/use-fund-treasury.ts`, `lib/chain/fund.ts`) sends ONE
  transaction `[SetComputeUnitLimit 600k, wrap_confidential, fund_treasury, deposit_confidential, apply_treasury_pending]`: one wallet
  approval, never leaves money half-way. It first reads the treasury FRESH and decrypts it, because `apply_treasury_pending` needs
  `expected_pending_balance_credit_counter = current counter + 1` and `new_decryptable_available_balance = AES(available + pending +
  amount)`. Wrap creates the admin's plain WUSDC account (and the escrow) itself, so funding does not require the admin to have activated a
  personal confidential account. Needs devnet USDC in the wallet (Circle faucet, Solana Devnet); the sheet shows the balance, a Max
  button and the faucet link. **Gotcha:** the generated `findWrappedMintPda` / `findWrappedMintAuthorityPda` default to the VAULT program;
  those PDAs belong to the token-wrap program, so pass `programAddress` (a unit test pins the derived mint to the WUSDC constant). Verified
  on a devnet-forked surfpool (USDC given with the cheatcode `surfnet_setTokenAccount [owner, mint, {amount}, tokenProgram]`): fund 3
  then top-up 2 through the real UI, treasury decrypts 3.00 then 5.00, wallet USDC 10 -> 7 -> 5. Public by design: the funding amount is visible.
- **Company setup is real (2026-10-05).** `useCompanySetup` (`components/chain/use-company-setup.ts`,
  `lib/chain/company.ts`) sends ONE transaction `[initialize_vault?, VerifyPubkeyValidity, configure_treasury_account]`: a single
  wallet approval, no half-created company (if a vault exists but its treasury is unconfigured, e.g. made by another client, it
  skips `initialize_vault` and just finishes configuration). It fits the default compute budget. The treasury is the **vault PDA's**
  associated token account (not the admin's), registered with the admin's wallet-level ElGamal key, the same key as the admin's
  personal account. Shared proof helper: `lib/chain/key-registration.ts` (used by activation too). Verified on a devnet-forked
  surfpool with a fresh funded wallet through the real UI: vault + treasury created in one tx, treasury owner = vault PDA,
  `approved`, key matches `Vault.treasuryElgamalPubkey`, Overview decrypts 0.00, company nav and `/admin/*` open. Unit-tested
  (order, accounts, token program, proof validity, repair path). Company pages are closed until the vault AND treasury are configured.
- **First real write: account activation (2026-10-05).** `useActivation` (`components/chain/use-activation.ts`) sends ONE
  transaction `[VerifyPubkeyValidity, vault::create_confidential_account]` (`lib/chain/activate.ts`; the proof must be
  the instruction immediately before the program's, and `create_confidential_account` does create + reallocate + configure
  internally, so activation is not three transactions). Signing goes through `useWalletAccountTransactionSigner`
  (`components/chain/tx-signer.tsx`, only offered when the account supports `solana:signTransaction` on devnet); sending and
  confirmation use our RPC (`lib/chain/send.ts`: blockhash expiry, preflight logs mapped to readable errors, polls to
  `confirmed`). **Gotchas:** the Codama builder defaults `tokenProgram` to the classic SPL Token program, so pass
  `TOKEN_2022_PROGRAM_ADDRESS` explicitly (a unit test pins this); reads and the blockhash use `confirmed` so a new account
  shows up in seconds. **Verified end to end** on a devnet-forked surfpool (`surfpool start --network devnet --no-tui
  --no-studio --no-deploy`: it lazily pulls the real vault program and WUSDC mint from devnet and gives free airdrops) with a
  funded throwaway wallet driven in headless Chrome: one signature for keys, one transaction, page flips to activated and the
  new account decrypts to 0.00 (first real decrypt). Also unit-tested (shape, proof validity, key bytes). The WUSDC mint
  currently has `autoApproveNewAccounts = true`, so no approval step is needed (D4 is moot for this mint). Test recipe:
  clone the app to a scratch dir (never run a second `next dev` in this directory), set `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899`.
  Not yet tried against real devnet with a real wallet app. Every other write still goes through `useLiveGuard`.
- **Chain reads live for real wallets (2026-10-05); writes still not wired.** `lib/chain/{rpc,read,decrypt}.ts`,
  `components/chain/chain-state.tsx` (`ChainProvider`/`useChain`, polls every 20s while the tab is visible, header refresh
  button) and `use-confidential-balance.ts`. A real wallet now shows its true SOL, whether its WUSDC account exists with the
  confidential extension (= "activated"; `approved` is surfaced for decision D4), its vault PDA state (exists, paused,
  treasury configured), and activation of everyone on its payroll list (one batched call). Balances decrypt only while keys are
  unlocked and are dropped on lock; an account registered under a different key shows a clear error instead of garbage. The
  light hooks `useAccountStatus` / `useCompanyStatus` need no keys (the shell uses them); `useEmployee` / `useVault` decrypt.
  **Still mock for real wallets:** employee list and run history (now D1, see "Off-chain data") and per-payment history (needs the
  indexer). Every action that would send a transaction goes through `useLiveGuard()`, which toasts "not wired yet" for real
  wallets and lets demo wallets run the mock flow. Verified: PDA derivation, Vault decoding and treasury-token decoding against
  4 real devnet vaults; decryption against synthetic ciphertexts (2 tests); end-to-end in headless Chrome against live devnet
  (fresh wallet: 0 SOL, no account, no vault, `/admin/payroll` redirects). **Not verified:** decrypting a real devnet account
  (no account of ours exists under the canonical WUSDC mint yet), so the first real activation should be watched.
- **Real wallet + key derivation live (2026-10-05).** Connect via wallet-standard; unlocking keys asks the wallet for one
  `signMessage` and derives the ElGamal + AES keys (`lib/crypto/keys.ts`, `components/crypto/wallet-key-provider.tsx`;
  `useKeys().getKeys()` hands out the material, `elgamalPubkey` is public). Demo wallets still play the animation only.
  Tested: 4 bun tests (determinism, distinct wallets, rewriting wallet rejected, declined prompt), and an end-to-end run in
  headless Chrome with an injected fake wallet-standard wallet (detect, connect, route to `/pay`, unlock with exactly one
  signature, reload keeps the connection and re-locks keys, disconnect sticks). **Not yet tried with a real wallet app**:
  whether Phantom/Solflare/Backpack sign the `solana-conf-bal/v1` message unmodified and repeatably is the open risk. Balances
  and actions are still mock.
- All 12 vault instructions now exist and are tested on-chain, including `pay_employee`, `pause_payroll` and
  `resume_payroll` (auditor rotation is a direct Token-2022 call, not a vault instruction); see `../CLAUDE.md`. The vault's instruction set is the
  12 names in the architecture PDF: `initialize_vault`, `configure_treasury_account`, `fund_treasury`,
  `deposit_confidential`, `apply_treasury_pending`, `create_confidential_account`, `wrap_confidential`,
  `unwrap_confidential`, `withdraw_confidential` exist; `pay_employee`, `pause_payroll`, `resume_payroll`
  are coming. Build the UI and pipeline against the existing ones and stub the rest behind a clear
  interface. `transfer_confidential` and `create_user_account` no longer exist.
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
