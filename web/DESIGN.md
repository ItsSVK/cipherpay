# Design: Daylight Ledger

Recorded 2026-10-04 from the built UI (hand-written; the shipped documenter agent was not available in this session). Direction picked by the user from the modern hand, seed `e0e4b79b`. **Not yet visually reviewed in a browser** (see CLAUDE.md "Known current state").

## Idea
Confidential values are physical-feeling ciphertext. A secret is a block of hex glyphs the same width as the value it hides; when its owner holds the key, each glyph scrambles and locks into place, then flashes green once. Crypto character comes from this motion and from honest disclosure labels, not from a dark neon theme.

## Colour (flat only, no gradients, light only)
Tokens live in `src/app/globals.css`.
- Ground `--background` paper (oklch .975 .004 100); plates `--card` white; rules `--border`.
- Ink `--foreground`; muted text `--muted-foreground` (>= 4.5:1 on paper).
- One accent: `--primary` indigo = "key". Tint `--accent` for active/running.
- Semantics: `--verified` green = decrypted/confirmed, `--pending` amber = public/pending, `--destructive` red = failed. Cipher chip: `--cipher` / `--cipher-ink`.
- Fingerprints: five flat colour blocks hashed from an address or key label (`Fingerprint`).

## Type
Geist for UI, Geist Mono for every amount, ciphertext, address and hash (tabular numerals via `.tnum`), Bricolage Grotesque for h1-h3 only. Page titles 28-30px, landing h1 up to 68px. Body 13-15px.

## Shape and depth
Radius 10px base. `.plate` = white panel, 1px border, one soft offset shadow. Hairline dividers inside lists. No nested cards, no side-stripe borders.

## Motion (all gated by prefers-reduced-motion)
- Easing `--ease-out` cubic-bezier(.16,1,.3,1); fast 150ms, base 260ms, slow 520ms.
- `Cipher` + `useCipherText`: left-to-right scramble, 48ms noise refresh, staggered `delay` so a table decrypts as a wave.
- Key chip + `LockIcon`: shackle lifts on unlock; chip pulses while locked; `KeyDerivation` shows signature, ElGamal, AES stages with hex churn.
- `PipelineTrack` / `StepList`: stations fill, segment draws, running stage pulses with `HexTicker`.
- Segmented controls slide one indicator by transform. Buttons press to 0.975. Rows rise in with a 55ms stagger (`.enter`).

## Components (src/components)
`wallet/`: wallet-context (mock), connect-screen. `crypto/`: cipher, use-cipher-text, key-context, key-chip, key-derivation, unlock-dialog, pipeline-track, step-list, hex-ticker, lock-icon, fingerprint. `app/`: app-shell, segmented, status-badge, page-header, copy-button, fund-sheet, employee-context, nav. `landing/`: lens-demo (Public / Employee / Auditor), pipeline-demo. shadcn primitives in `ui/` (base-nova style, Base UI).

## Rules
- Never show an amount as plain text unless the viewer holds the key or the employer typed it. Disclosure steps are labelled Public or Encrypted.
- Mono only for data. No kickers above headings. No gradients, glass or glow.
- Placeholder to replace: the product name "Cipherpay" and its mark (`components/app/brand.tsx`).
