# Confidential Payroll on Solana: Product Context

**Status:** Active build, Solana hackathon (Colosseum), devnet only.
**Team:** 3 people, roughly 2 weeks from 2026-10-01 (confirm the real deadline and write it here).
**Decision (2026-10-01):** confidential payroll is the product, first and final for this build. This
supersedes the 2026-09-16 "P2P transfer is primary" decision. P2P transfer instructions still exist
and are tested, but they are now the *primitive layer* under payroll, not a separate product.

This file is the single source of truth for *what* we are building and *why*. It is read by
teammates and by Claude Code in both halves of the repo. Engineering detail lives in:

- `CLAUDE.md` (repo root): the on-chain half (Anchor workspace)
- `web/CLAUDE.md`: the app half (Next.js)

## 0. Repo layout (both halves live under one root)

```
<root>/                   <- the Anchor workspace is the repo root
  PRODUCT.md              <- this file (product truth, shared)
  CLAUDE.md               <- on-chain half conventions
  programs/vault/                        Anchor program (payroll vault + P2P primitives)
  native_programs/token_wrap_compliance/ raw native program (fork of Anza spl-token-wrap)
  libs/confidential_token_helpers/       shared Rust lib (not deployed)
  client/                                legacy standalone TS round-trip client (reference for the port)
  web/                    <- Next.js app: the product UI + client-side proof/orchestration
    CLAUDE.md
```

The two halves are one product. A change to an instruction, account, event, or error in the on-chain half
is a breaking change for `web/` until the IDL and generated client are regenerated (see both
CLAUDE.md files for the handoff procedure). If folder names change, update the paths in this file and
both CLAUDE.md files.

## 1. One-line pitch

**Payroll where the public can't see salaries, but the auditor can.**

An employer funds a treasury with USDC, reviews a payroll list, approves it, and every employee is
paid in one flow. Amounts are encrypted on-chain (Token-2022 confidential transfer), each employee
sees and withdraws their own pay, and a designated auditor can decrypt everything. The public sees
*that* payroll happened, never *how much*.

## 2. The problem

Paying people in USDC on Solana today has two bad options:

1. **Plain wallet transfers.** Anyone can look up the company wallet and read every salary.
2. **Shielded-pool mixers.** They hide too much (sender and receiver), carry real legal exposure,
   and give a company no compliance story.

Token-2022's Confidential Transfer extension hides the *amount* while keeping addresses public and
auditable. It is real and working, but used directly it has three gaps for a business:

1. **No batching.** Paying N people confidentially means N manual multi-transaction flows (each
   transfer needs three ZK proofs that do not fit in one transaction).
2. **No sponsored onboarding.** A new recipient needs their own SOL and signature to set up a
   confidential account. We do **not** solve this in the hackathon build: every signer pays their
   own fees (see decision 9). Admin-sponsored fees are a possible later extension.
3. **No compliance layer by default.** Amounts can be hidden from everyone, including the
   company's own accountant, unless an auditor key is wired in.

Our programs and client close the batching and compliance gaps.

## 3. Who uses it, and the real-world flow

**Acme Labs** is a 10-person crypto startup. **Priya** is the finance admin. **Raj** is the
accountant (auditor). **Sam** is an outside contractor.

### One-time setup

| Priya does | What happens |
|---|---|
| Connects wallet, clicks "Create payroll vault" | `initialize_vault`, then `configure_treasury_account` (encrypted treasury) |
| Names an auditor | Auditor ElGamal key is registered (see Open Decision D2 on scope) |
| Deposits USDC | Wrap USDC to WUSDC, then `fund_treasury`, `deposit_confidential`, `apply_treasury_pending` |
| Adds her team (name, wallet, salary) | Stored **off-chain** in the app's database, not on-chain |

Each employee opens the app once and clicks **Activate** to set up their confidential account.

### Payday

1. Priya reviews the payroll list (10 people, total $38,000).
2. **Simulation first:** treasury has enough, every recipient is activated, nobody is missing.
3. She approves and signs. Her browser derives her keys and generates the ZK proofs (proofs can
   only be generated client-side).
4. The app runs the payout pipeline: per recipient, create proof context accounts, then call
   `pay_employee`. Transfers are chunked across many transactions.
5. Each employee logs in, decrypts their own pay with their own wallet, and withdraws or unwraps
   part or all of it to real USDC when they choose.
6. Raj opens the auditor view and decrypts all 10 payments.

Public explorer view: the vault paid 10 wallets. Amounts are ciphertext.

### Split payout (the "programmable money" demo)

One payment that divides by a rule and only runs after approval. Contractor example:

> Sam's invoice is **$10,000**. Rule: **79%** to Sam, **20%** to Acme's tax-reserve wallet, **1%**
> to the platform fee wallet.

1. The rule is defined once (percentages and destination addresses).
2. Invoice arrives; Priya sees "Pay $10,000?" with the breakdown.
3. She clicks **Approve**. Nothing moves before this.
4. The app runs the same payout pipeline with 3 recipients, amounts computed from the percentages.
5. All three transfers are confidential; the auditor sees the full breakdown.

It is a batch of 3 whose amounts come from a rule. It costs 1 to 2 days on top of the batch
pipeline and is the **first thing to cut** if time is short.

Where the wallets come from: all three are ordinary Solana addresses pasted into the rule.
Sam's is the contractor's. The tax-reserve wallet is Acme's own (separate wallet or multisig, for
bookkeeping). The platform-fee wallet is owned by us (the team) and is our monetization story.
**Every destination must have an activated confidential account**, so the simulation step must
check that.

**Important:** percentages are computed client-side and are *policy*, not on-chain enforcement.
The program never sees hidden amounts, so it cannot verify that 79/20/1 was honored. The auditor
can verify after the fact by decrypting.

## 4. Phases

### Phase 0: Primitives (DONE, tested)

- Token-2022 confidential-transfer account setup, with PDA-owned and wallet-owned variants.
- `token_wrap_compliance`: 1:1 wrap of real USDC into a confidential-capable Token-2022 mint
  (confidential transfer + designated auditor + permanent delegate + pausable).
- Primitives: `create_confidential_account`, `wrap_confidential`, Deposit/ApplyPending,
  `withdraw_confidential` (2 proofs), `unwrap_confidential`.
- Payroll: `initialize_vault`, `configure_treasury_account`, `fund_treasury`, `deposit_confidential`,
  `apply_treasury_pending`, and (built 2026-10-03) `pay_employee` (3 proofs, auditor event),
  `pause_payroll`, `resume_payroll`. All 12 vault instructions exist; the on-chain half of Phase 1 is done and
  proven on litesvm and a local surfpool validator.
- Both programs live on devnet with a canonical WUSDC mint.
- Round trip proven in litesvm and against a local surfpool via an independent TS client.

### Phase 1: Hackathon MVP (2 weeks, this build)

**Must have**

- `pay_employee` (treasury to one recipient, `invoke_signed` with vault seeds).
- Batch payout pipeline (client-orchestrated chunking and sequencing, **not** a naive loop).
- `pause_payroll` / `resume_payroll` guard. Pause blocks `pay_employee` only; employees can
  always withdraw their own funds.
- Next.js app on real devnet with wallet connect: admin, employee, and auditor views.
- Pre-run **simulation** (balance check, every recipient activated, totals).
- Real auditor decryption view (see section 7.6 for how it finds payments).
- Honest product copy about what is hidden vs revealed (see section 7.4).

**Should have**

- Split payout with an approve-then-execute flow (section 3).
- ~~Flat per-payout platform fee wired into the program (see section 8).~~ **Dropped 2026-10-04** for the hackathon build; roadmap only.
- Progress and resume UI for a payroll run (which recipients are paid, which failed).

**Cut for the hackathon**

- On-chain employee CRUD (employee list stays off-chain), `close_user_account`.
- Chain indexer for the auditor view, on-chain payroll-run record, and cleanup or recovery of
  failed runs (orphaned proof context accounts). All Phase 2.
- Retries beyond simple "resume remaining recipients".
- Reconciliation, RBAC, recurring payments, mainnet.

### Phase 2: Custody-safe SDK and hosted services

- **TypeScript SDK**, run inside the *customer's* backend with the customer's keys, so we never
  hold treasury keys. Seed: the proof/orchestration library in `web/` (extracted into a package).
- **Hosted API** for everything that is *not* key-sensitive and is therefore meterable:
  payment simulation, webhooks and batch status, transaction submission and retry through our RPC,
  reconciliation and audit trail, employee/policy management.
- API-key auth, rate limits, usage dashboards, free tier then paid tiers (per batch or per seat).
- Per-employer auditor model (see Open Decision D2).

### Phase 3: Programmable workflows

- Recurring, milestone, and vendor payments; conditional payouts triggered by invoices, approvals,
  or external events.
- Multi-party approval policies (approver and executor can be different people), role-based
  spending limits, transaction policy enforcement.
- Automatic treasury allocation and scheduled sweeping; invoice-to-payment reconciliation;
  unified audit trail; real-time webhooks.
- **Requires a key-custody design** for unattended proof generation (section 7.3).
- Note: policies over *confidential* amounts cannot be enforced by the program directly, since it
  cannot read them. Limits and rules are enforced in the client/SDK or via future ZK design.

### Phase 4: Production

- Mainnet deployment, authority-role hardening (split the four authority roles), security review,
  real auditor key management, liquidity/redemption considerations for wrapped assets.

## 5. Team split and timeline (3 people, ~14 days)

| Role | Owns |
|---|---|
| **Protocol** (on-chain: `programs/`) | `pay_employee` (with its auditor-ciphertext event), pause/resume, flat fee, tests, devnet redeploys, IDL handoff |
| **Client/proofs** (`web/src/lib`) | Port of proof generation to `@solana/kit`, batch pipeline, simulation, resume logic, off-chain API |
| **Frontend/pitch** (`web/src/app`) | Wallet connect, admin/employee/auditor views, split-payout UI, demo video, pitch deck |

| Days | Goal |
|---|---|
| 1 to 5 | `pay_employee` and one real devnet confidential payout end-to-end from the browser |
| 6 to 9 | Batch pipeline and the three UI views |
| 10 to 12 | Split payout, auditor view, polish, fee |
| 13 to 14 | Buffer, demo video, submission |

The critical path is Protocol, then Client. Frontend should build against a stub of the pipeline
in the first days and not wait.

## 6. Why this scope (and why not the others)

- It keeps the only real differentiator: **amount privacy with an audit trail**.
- It reuses almost everything already built.
- The hard part (batch confidential payout) is visible on-chain in the demo.
- It is legible in 30 seconds.

**The generic "programmable payout platform" pitch was rejected as the build target** because it
drops the privacy differentiator, competes with funded payout tools (Request Finance, Streamflow,
Squads, stablecoin payout APIs), and most of its feature list is ordinary backend work that does
not demo well. It stays as the roadmap (Phases 2 and 3).

## 7. Core architecture

### 7.1 Separate spend authority from decryption authority

- **Treasury token account owner = vault PDA.** The program can CPI confidential `Transfer` on the
  treasury's behalf with `invoke_signed`.
- **ElGamal and AES keys = derived from the admin's real wallet signature**, never the PDA. The
  PDA cannot decrypt anything. Only the admin (and the auditor) can read treasury amounts.

These two identities are intentionally different. Do not conflate them.

### 7.2 Key derivation

Keys are never randomly generated and stored. They are re-derived deterministically:
`derive(wallet_signature_of(fixed_message, owner_pubkey, mint_pubkey))`. Ed25519 signatures are
deterministic, so this is reproducible from the wallet alone. Implemented by
`deriveElGamalKeypairForOwnerMint` / `deriveAeKeyForOwnerMint` in
`@solana-program/token-2022/confidential`.

UX decision (provisional): derive once per session via wallet `signMessage` and keep keys **in
browser memory only**, cleared on disconnect. Wallets that do not support `signMessage`
(some hardware wallet flows) cannot use the app; state this in the UI.

### 7.3 Key custody (decided for the demo, open for automation)

For the hackathon, a human is always present: the admin's click is the moment keys are used, the
browser generates proofs, and **no server ever holds a key**. "Approval-gated" works the same way.

If approver and key-holder are different people (CFO approves, Priya holds treasury keys),
approval cannot directly trigger payment. It marks the payout "approved", and the key-holder then
opens the app and executes. **Decided for the demo:** one employer admin is the approver and the
signer, so approval lives in the off-chain database and gatekeeps no one else. The two-step flow
is roadmap.

Automation (recurring, event-triggered, API-driven) needs unattended proof generation, which means
a server or SDK holding treasury keys. That is **Phase 2/3**, and the honest answer is: SDK in the
customer's infrastructure first; later options include a scoped operator key with limits or a
TEE/MPC signer. Name this as an open problem on the roadmap slide.

### 7.4 Compliance and disclosure control

- An **auditor ElGamal pubkey** on the mint means every confidential transfer is also encrypted to
  the auditor, who can decrypt all amounts. This is what keeps the project on the
  "compliance-friendly privacy" side of the line.
- Confidential transfer hides the amount of *one transfer*, not a balance forever. `Withdraw` and
  `Unwrap` make a specific amount plaintext. Both accept **partial** amounts, so users can disclose
  gradually.
- The correlation leak is **symmetric**: the sender's wrap/deposit and the recipient's
  withdraw/unwrap are both plaintext. An exact-amount, tightly-timed pair on both ends makes the
  encrypted middle hop trivially linkable.
- **We will not build anti-correlation infrastructure** (batching-as-obfuscation, jitter, mixing).
  That is the shielded-pool / Tornado-shaped legal exposure we rejected. Disclosure timing and
  amount are the holder's choice.
- What *is* our job: (1) partial and delayed disclosure must be a natural default in the UI, not a
  power-user option; (2) product copy must say plainly that the transfer is encrypted and that
  disclosure is the user's own choice and responsibility.

### 7.5 Proofs are client-side, and transactions are small

- The program can verify or reference proofs but can never generate them (no private key).
- A confidential `Transfer` needs three proofs (equality, ciphertext-validity, range). They do not
  fit alongside the transfer instruction, so each is created in its own context-state account first.
- A real validator enforces the 1232-byte transaction limit (litesvm does not). Creating a context
  account and populating it with `VerifyProof` must be **two separate transactions** on a real
  cluster. This shapes the whole batch pipeline.

### 7.6 Auditor view: how it finds payments

Option chosen: the run history plus an event ciphertext.

1. The client stores the **transaction signature per recipient** in the off-chain run history
   (REQ25).
2. `pay_employee` emits an event that carries the amount **encrypted for the auditor** (read from
   the ciphertext-validity context account), never the plaintext. Built: the bytes come from the
   instruction arguments (`transfer_amount_auditor_ciphertext_lo`/`_hi`), which Token-2022 requires to match the
   ciphertext-validity context, so the event cannot differ from what was proven. The amount is
   `lo + hi * 2^16`.
3. The auditor view fetches each recorded transaction by signature and decrypts the ciphertext
   with the auditor secret (REQ26).

Scope: app-originated payments only. A chain indexer that covers every payment is Phase 2. Note
the context accounts are closed after each payment, so ciphertexts survive only in transaction
history and events, which is why the event carries it.

## 8. Monetization

| Model | Notes |
|---|---|
| **Flat per-payout fee, enforced on-chain** | A fixed amount (SOL or plaintext token amount) collected per `pay_employee`. Cannot be bypassed. |
| **Hosted API tiers (Phase 2)** | API-key auth for simulation, webhooks, reconciliation, audit trail, submission/retry. |
| **License-key check in SDK** | Weakest; easy to patch out. Do not rely on it. |

**Correction to an earlier idea:** a *percentage* fee (e.g. 0.5%) cannot be enforced by the
program, because amounts are encrypted and the program cannot compute a percentage of a value it
cannot read. On-chain fees must be flat and plaintext. A percentage "platform fee" in a split
payout is a client-side policy line, not protocol enforcement.

## 9. Decisions log

### Decided

| # | Decision |
|---|---|
| 1 | Confidential payroll is the product. P2P instructions are the primitive layer. (2026-10-01) |
| 2 | Amount privacy with an audit trail. Identity unlinkability (shielded pool) is out of scope. |
| 3 | Treasury spend authority = vault PDA; decryption authority = admin-derived keys. |
| 4 | Demo keeps all key use in the admin's browser; no server-held keys. |
| 5 | Employee list, payout rules, approvals, and run history live **off-chain**. |
| 6 | Real USDC enters via `token_wrap_compliance` into one canonical WUSDC mint per real asset. |
| 7 | No anti-correlation features. Disclosure control and honest copy instead. |
| 8 | Split payout percentages are client-side policy, verifiable by the auditor, not on-chain. |
| 9 | **Employee accounts are wallet-owned** (`create_confidential_account`). Employees reuse `withdraw_confidential` and `unwrap_confidential` directly; no payroll-specific withdraw or close instruction. Every signer pays their own fees, so employees need their own SOL for withdrawals. (Former D1.) |
| 10 | **Auditor view data source:** transaction signatures stored per recipient in the run history, plus an auditor-encrypted ciphertext emitted in the `pay_employee` event. Covers payments made through the app. A full chain indexer is Phase 2. |
| 11 | **Auditor rotation is not a vault instruction.** It is a direct Token-2022 `UpdateMint` signed by the mint's confidential-transfer authority (the deployer wallet unless moved to the Vault PDA). Roadmap (REQ21). |
| 12 | `pause_payroll` blocks only `pay_employee`; withdrawals stay open by design. |

### Open (surface to the team on day 1; a recommended default is given)

| # | Question | Recommended default |
|---|---|---|
| D2 | **Auditor scope:** the canonical WUSDC mint has *one* mint-level auditor key, so every employer on this mint shares one auditor. Raj cannot be Acme's auditor unless he holds that key. | For the demo, use a platform-designated auditor and replace the throwaway key (below). Per-employer auditors are Phase 2 (options: employer shares a viewing key, or a mint per tenant, which changes the PDA assumption). |
| D3 | **Batch design:** monolithic on-chain `batch_pay` vs on-chain `pay_employee` plus a client pipeline. | Client pipeline. Per recipient: create 3 proof contexts (parallelizable, independent), then `pay_employee`. Track state off-chain so a failed run can resume. |
| D4 | **Auto vs manual new-account approval policy** on the vault's mint. | Not yet decided. Flagged since `initialize_vault`. |
| D5 | **Key-derivation UX:** sign once per session, in-memory cache. | Provisional yes (section 7.2). |
| D6 | **Off-chain store:** which database and where it runs. | Pick on day 1 and write it into `web/CLAUDE.md`. |
| D7 | **Authority roles on the WUSDC mint:** all four point to one deployer wallet. | Acceptable for devnet demo; split before any real funds. |

**Known gap to fix before the auditor view can work:** the auditor ElGamal pubkey baked into
`token_wrap_compliance` is a randomly generated throwaway (see
`native_programs/token_wrap_compliance/DEVNET_DEMO_AUDITOR_KEY.md`). The auditor view needs
the matching **secret**, so confirm it was saved, or rotate the auditor on the mint
with a direct Token-2022 `UpdateMint` (decision 11) to a key we control.

## 10. Rejected and out of scope

- **Shielded pool / mixer.** Strictly worse than funded competitors (PrivacyCash, Umbra) and legally
  adjacent to Tornado Cash. Rejected, re-affirmed in section 7.4.
- **PDA-per-user to hide wallets.** A PDA derived from a wallet is trivially re-derivable, so it
  gives zero privacy. The PDA here exists for transaction authority (batching), not
  hiding identity.
- **A general-purpose published SDK as the *hackathon* deliverable.** Promoted to Phase 2, as a
  custody-safe SDK, not a hosted proof service.
- **Hosted proof generation** (our server holding customer keys). Rejected: custody risk and
  unlicensed-money-transmission exposure.
- Mainnet, mobile-polished UI, on-chain employee CRUD, recurring and conditional payouts in the
  hackathon build.

## 11. Tech stack (summary)

| Layer | Choice |
|---|---|
| Programs | Anchor (Rust), plus one raw native program, SPL Token-2022 confidential transfer |
| Proofs | `@solana/zk-sdk` (WASM, browser), `@noble/curves` for Ristretto arithmetic the WASM lacks |
| Client | `@solana/kit` (v6), `@solana-program/token-2022` (+ `/confidential`), generated program client |
| App | Next.js (App Router), TypeScript, Bun, Tailwind, shadcn/ui |
| Testing | litesvm (in-process), surfpool (local validator), devnet |
| CLI reference | `spl-token-cli` **>= 5.6.1**, installed with `--locked` |

The ZK ElGamal Proof program was disabled network-wide (mid-2025) and re-enabled around June 2026,
with breaking client changes. **Pin versions deliberately; do not trust older tutorials.**

## 12. Pitch (current)

> "Paying people in USDC on Solana today means every salary is public, or you use a mixer with no
> compliance story. We built the missing middle: payroll where amounts are encrypted end-to-end,
> each employee sees and withdraws their own pay, and an auditor can always verify. Run payroll for
> a whole team in one flow, with a simulation first, an approval gate, and a split-payout rule for
> contractors. This is a custody-safe foundation: later, an SDK lets any fintech or HR platform run
> confidential payouts from its own backend, with keys that never leave their infrastructure."

Demo emphasis: show the batch pipeline running on devnet, show the explorer with hidden amounts,
show the auditor decrypting what the public cannot, and be explicit about how this differs from
(and does not compete with) shielded-pool protocols: different threat model, different regulatory
posture, on purpose.

## 12.5 Capstone architecture document (reference IDs)

The capstone architecture doc defines three MVP use cases and numbered requirements. Use these
IDs in commit messages, test names, and comments:

| UC | Instruction | Signer |
|---|---|---|
| UC1 | `pay_employee` | Employer admin |
| UC2 | `withdraw_confidential` | Employee |
| UC3 | `pause_payroll` | Employer admin |

REQ01 to REQ12 cover the use cases, REQ13 to REQ21 the supporting instructions
(`resume_payroll`, `initialize_vault`, `configure_treasury_account`, `fund_treasury`,
`deposit_confidential`, `apply_treasury_pending`, `create_confidential_account`,
`wrap_confidential`, `unwrap_confidential`, and roadmap auditor rotation), and REQ22 to REQ27 the
client logic (simulation, two-transaction context accounts, key handling, run tracking, auditor
decryption, split math). If this file and the doc disagree, fix both.

## 13. How to pick this up

If you are a teammate or an AI model starting fresh:

1. Read this file, then the CLAUDE.md of the half you are working on.
2. Phase 0 is done. The next work is Phase 1 (section 4). The critical path is `pay_employee` in
   `programs/vault/` and the proof/batch pipeline in `web/`.
3. **Not true yet, do not overclaim:** no end user has run a payroll against devnet through the
   app. The round trip is proven in litesvm and local surfpool only. The `web/` app is not yet
   wired to devnet.
4. Resolve open decisions D2 and D3 before writing code that depends on them (D1 is now
   decision 9).
