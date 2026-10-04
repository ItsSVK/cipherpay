# Product

<!-- impeccable:product-schema 1 -->

Distilled from `../PRODUCT.md` and `CLAUDE.md` (this folder) on 2026-10-04. Those remain the source of truth; update this file when they change.

## Platform

web

## Stack

Existing codebase: Next.js 16 (App Router) on Cloudflare Workers, Tailwind 4, shadcn/ui, bun. Visual direction is the user's: shadcn components, no gradients.

## Users

- **Admin (e.g. a finance admin at a small crypto company):** connects a wallet, creates the payroll vault, funds the treasury, manages the employee list, simulates then approves and runs payroll, runs split payouts, pauses/resumes payroll.
- **Employee / contractor:** activates a wallet-owned confidential account, sees their own pay (decrypted locally with their wallet), withdraws or unwraps part or all to public USDC when they choose.
- **Auditor (e.g. the company's accountant):** connects with the auditor key and decrypts every payment made through the app.

All three are crypto-literate wallet users on desktop and mobile browsers.

## Product Purpose

Confidential payroll on Solana devnet: the public can see that payroll happened, never how much; each employee sees their own pay; a designated auditor can decrypt everything. Success is an admin paying N people in one reviewed, approved flow, and each recipient and the auditor independently seeing exactly what they are entitled to.

## Positioning

Token-2022 confidential transfers hide amounts while keeping addresses public and auditable. This product adds the layer the raw primitive lacks: batched payouts, a compliance/auditor view, and approve-then-execute workflows. It is explicitly not a shielded-pool mixer.

## Operating Context

- All ZK proofs, key derivation and decryption run in the browser; keys never leave it. Keys are derived from a wallet `signMessage` per session and held in memory only.
- A payroll run is dozens of transactions (about 7 per employee: three proof-context accounts, then `pay_employee`, then context close); progress must be reported live and runs must resume without double-paying.
- Run flow: simulate (treasury covers total, every recipient activated, no duplicates/zeros, vault not paused) then approve then execute. Status: `draft -> pending_approval -> approved -> executing -> done|failed`. Per-recipient: pending, proofs-ready, sent, confirmed, failed.
- Employee withdrawal is two calls: Token-2022 `ApplyPendingBalance`, then `withdraw_confidential`; unwrap to USDC after.
- Every signer pays their own fees, so employees need their own SOL.
- Amounts are 6-decimal USDC/WUSDC, handled as `bigint`.

## Capabilities and Constraints

- 12 on-chain instructions exist and are tested; this UI pass uses mock data. Real wallet, proofs and chain calls come later.
- Split payout: rule of destinations and percentages (e.g. 79/20/1), computed client-side, remainder to the primary recipient; percentages are policy, not on-chain enforcement.
- Wallet library undecided. Devnet only; no mainnet paths.
- Pause blocks only `pay_employee`; withdrawals stay open on purpose.
- Auditor key on devnet is a throwaway demo key (see root docs); the auditor view must make the "which key" state explicit.

## Brand Commitments

- Product name is not yet decided; the working title is "Confidential Payroll".
- Binding visual constraints from the user: shadcn/ui, no gradient colors, smooth micro-interactions, a crypto-native feel, and interactive encryption/decryption animations tied to real functionality (ciphertext scramble and reveal, key derivation, proof generation progress).

## Evidence on Hand

- Real flow and instruction behavior in `../PRODUCT.md` and `../CLAUDE.md`; a working round trip exists in `../client/`.
- No logo, customers, testimonials, benchmarks or pricing exist. None may be fabricated; any figures shown in the UI are mock data and must read as such.

## Product Principles

1. **Say exactly what is hidden.** The transfer is encrypted; funding (wrap/deposit) and cash-out (withdraw/unwrap) are public. Never imply absolute secrecy.
2. **Disclosure is the user's choice.** Partial and delayed withdrawal is the default path, not an advanced option.
3. **Nothing moves before approval,** and every step of a run is visible, resumable and never double-pays.
4. **Keys stay in the browser.** The UI makes key state (locked, derived, cleared) legible at all times.
5. **No anti-correlation features** (mixing, jitter, batching-as-obfuscation); this is a decided rejection.

## Accessibility & Inclusion

No product-specific standard established. Motion must respect `prefers-reduced-motion` and never be the only carrier of state.
