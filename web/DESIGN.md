---
name: Cipherpay
description: Confidential payroll on Solana. Paper-white ledger, one indigo key colour, amounts as ciphertext until their owner unlocks them.
colors:
  background: "oklch(0.985 0.002 95)"
  card: "#ffffff"
  foreground: "oklch(0.16 0.012 265)"
  muted: "oklch(0.965 0.004 95)"
  muted-foreground: "oklch(0.48 0.015 265)"
  border: "oklch(0.925 0.006 265)"
  input: "oklch(0.90 0.006 265)"
  primary: "oklch(0.47 0.22 274)"
  primary-foreground: "#ffffff"
  accent: "oklch(0.96 0.02 274)"
  accent-foreground: "oklch(0.38 0.18 274)"
  ring: "oklch(0.52 0.20 274)"
  verified: "oklch(0.55 0.16 155)"
  verified-soft: "oklch(0.972 0.035 155)"
  pending: "oklch(0.62 0.15 72)"
  pending-soft: "oklch(0.978 0.04 80)"
  destructive: "oklch(0.55 0.22 25)"
  failed-soft: "oklch(0.972 0.03 25)"
  cipher: "oklch(0.955 0.012 274)"
  cipher-ink: "oklch(0.44 0.15 274)"
typography:
  page-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  card-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
  panel-label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    letterSpacing: "0.05em"
  figure-hero:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1.875rem"
    fontWeight: 700
    fontFeature: "tnum"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  control: "0.5rem"
  row: "0.75rem"
  button-lg: "0.75rem"
  plate: "1rem"
  panel: "1rem"
  pill: "9999px"
spacing:
  gutter: "24px"
  plate-padding: "24px"
  panel-padding: "20px"
  row-padding-x: "24px"
  row-padding-y: "14px"
  section-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.button-lg}"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "36px"
  plate:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.plate}"
    padding: "{spacing.plate-padding}"
  inner-panel:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
  icon-tile:
    rounded: "{rounded.row}"
    size: "32px"
  status-badge-verified:
    backgroundColor: "{colors.verified-soft}"
    textColor: "{colors.verified}"
    rounded: "{rounded.pill}"
  status-badge-pending:
    backgroundColor: "{colors.pending-soft}"
    textColor: "{colors.pending}"
    rounded: "{rounded.pill}"
  status-badge-key:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.pill}"
  cipher-chip:
    backgroundColor: "{colors.cipher}"
    textColor: "{colors.cipher-ink}"
    rounded: "{rounded.control}"
  list-row-selected:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.row}"
---

# Design System: Cipherpay

**Every UI change in `web/` follows this file.** Tokens live in `src/app/globals.css`; the components named below are the
implementation and must be reused, not re-drawn. When a change adds a pattern that isn't here, add it here in the same commit.

## Overview

**Creative North Star: "The Daylight Ledger"**

A confidential value is a physical-feeling ciphertext: a block of glyphs the same width as the number it hides. When its owner
holds the key it scrambles and locks into place, then flashes green once. The crypto character comes from that motion and from
honest labels about what is hidden and what is public, never from a dark neon theme. Everything else is a calm, paper-white
ledger: white plates on a warm ground, hairline rules, ink text and one indigo colour that means "key".

The product is an operating tool (Operate mode): scanability and state legibility beat expression. Motion explains state
(locked → decrypted, queued → running → confirmed, waiting on the wallet) and is never decoration.

**Key characteristics**
- Light only. Flat colour. One accent (indigo = key / action / in-progress).
- Amounts are ciphertext until unlocked, everywhere, through `Cipher`.
- Every process is drawn as a chain of round nodes joined by rails that draw themselves (`Flow`).
- An action button becomes its own progress indicator (`ProgressButton`); nothing around it moves.
- Content that appears or disappears opens and closes in place (`Reveal`), it never pops or swaps sections.

## Colors

One indigo accent on a neutral paper ground, plus three semantic colours that each mean exactly one thing.

### Primary
- **Key Indigo** (`--primary`, oklch 0.47 0.22 274): the one action per surface (primary button), the working step, the selected
  item, the current status. Its tint **Key Wash** (`--accent`) fills selected rows and running lanes; **Key Ink**
  (`--accent-foreground`) is text on that wash.

### Semantic
- **Verified Green** (`--verified` / `--verified-soft`): decrypted, confirmed, done, passed. Never used for "active" or "live" decoration.
- **Pending Amber** (`--pending` / `--pending-soft`): public, pending, paused, needs attention soon (countdown under 10 s).
- **Failed Red** (`--destructive` / `--failed-soft`): failed, declined, unreadable, destructive action.
- **Cipher** (`--cipher` / `--cipher-ink`): the background and glyph colour of a value still encrypted.

### Neutral
- **Paper** (`--background`): page ground. **White** (`--card`): plates, sheets, dialogs.
- **Ink** (`--foreground`): text. **Graphite** (`--muted-foreground`): secondary text and captions (≥ 4.5:1 on paper).
- **Hairline** (`--border`): plate borders and row dividers (`border-border/60` inside lists). **Input** (`--input`): idle control borders.
- **Mist** (`--muted`): inner panels, list headers (`bg-muted/30`), side columns (`bg-muted/20`).

### Named rules
**The One Key Rule.** Indigo appears only where something is actionable, selected or working. If it is none of those, it is neutral.

**The Meaning Rule.** Green, amber and red are states, not decoration. A green dot must mean "verified/confirmed/live".

## Typography

**UI font:** Geist (`--font-sans`). **Data font:** Geist Mono (`--font-mono`), always with `.tnum`.
Headings also use Geist (`--font-heading`); Bricolage Grotesque is loaded but not used for headings any more.

**Character:** a quiet grotesk for words, a precise mono for every figure, address, signature and ciphertext.

### Hierarchy
- **Page title** (`PageHeader`): 24/30px, 600, tracking -0.025em.
- **Card title**: `text-sm font-semibold tracking-tight`, with a `text-[11px] text-muted-foreground` subline under it.
- **Body**: 13-15px. Copy inside cards is `text-xs` (12px) with `leading-relaxed` for sentences.
- **Caption / meta**: `text-[11px] text-muted-foreground`.
- **Panel label**: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80`, only as the label of an inner panel
  (e.g. "Batch total", "Pre-flight checks"). Never above a page or card heading.
- **Hero figure**: `text-3xl`/`text-4xl font-bold tracking-tight` mono, unit as a smaller sans suffix in `text-muted-foreground`.
- **Row figure**: `text-sm font-semibold` mono.

### Named rules
**The Mono Is Data Rule.** Mono only for amounts, addresses, signatures, hashes, countdowns. Never for labels or decoration.

**The Plain Words Rule.** Copy says what is happening in the product's terms ("Waiting for your wallet to approve the transfer"),
names the action on a button ("Save payroll", "Approve & run payroll"), and says plainly what is encrypted and what is public.

## Layout

- App shell: sidebar + top bar; page content in a column with `space-y-8` between sections.
- Every page starts with `PageHeader` (title, one-sentence description, actions on the right).
- Main working layout is **work + control**: `grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]` (or `1.25fr / 1fr`
  for overview-style pairs). The control column is `lg:sticky lg:top-20`. On phones the columns stack, work first.
- **Master-detail inside a plate**: a left column (`232px`, `bg-muted/20`, `border-r`) lists the things you choose from, the right
  shows the chosen one. The column scrolls on its own (`max-h`), gets a search box from ~6 items, and its "New" button is pinned at
  its top. It collapses (animate `grid-template-columns` to `0px`) when the task moves past choosing.
- Plate padding `p-5 sm:p-6`; list rows `px-5 py-3.5 sm:px-6`; inner panels `p-4`/`p-5`.
- Phones (390px): 16px gutters, no horizontal page scroll, flows shrink their nodes (`w-12`) rather than overflow.
- Never use horizontally scrolling rows of cards to choose between items. Use a vertical list.

## Elevation & Depth

Mostly flat with one soft offset shadow on plates; depth comes from tonal layering (paper → white plate → mist panel).

### Shadow vocabulary
- **Plate** (`.plate`): `0 1px 2px rgb(0 0 0/.03), 0 4px 12px -2px rgb(0 0 0/.03)`, slightly deeper on hover.
- **Small lift** (`shadow-2xs` / `shadow-xs`): icon tiles, primary buttons, the selected item.
- **Overlays**: sheets and dialogs use the shadcn defaults (`shadow-lg`/`shadow-2xl`).

### Named rules
**The No Nested Cards Rule.** Inside a plate, group with an inner panel (mist fill, `rounded-2xl`, no shadow) or with hairline rows,
never with another shadowed card.

**The Gradient Exception (known drift).** The brand commitment is "no gradients". Two near-invisible exceptions exist today and are
the only allowed ones: the inner-panel wash `bg-gradient-to-b from-muted/30 to-muted/10`, and one blurred tint circle per plate
(`size-40 rounded-full bg-primary/5 blur-3xl`, top-right). Do not add new gradients, glass or glows. Prefer replacing these with a
flat `bg-muted/20` if they are ever revisited.

## Shapes

- Base radius 10px (`--radius`). Controls `rounded-md`/`rounded-lg`; list rows, items and icon tiles `rounded-xl`; plates and inner
  panels `rounded-2xl` (`.plate` is 1rem); large buttons `rounded-xl`; badges and status dots fully round.
- Status is drawn with **circles**: step nodes, status marks, radio-like selection ticks. Checkboxes in forms are rounded squares.
- Borders are 1px hairlines. No side-stripe borders thicker than 1px. Dashed borders mean "not yet": an empty slot, a pending rail,
  or a working node's turning ring.

## Components

Reuse these. A new screen is assembled from them; if one doesn't fit, extend it here first.

### Plate with icon header (`.plate`, see `admin/page.tsx`, `admin/payroll/page.tsx`)
`section.plate.enter` with `style={{"--i": n}}` for the entrance stagger. Header: a `size-8 rounded-xl` icon tile tinted by role
(`bg-primary/10 text-primary` for work, `bg-verified/10 text-verified` for control/authority), a card title + subline, and a
`StatusBadge` on the right.

### Inner panel
`rounded-2xl border border-border/80` mist panel holding one hero figure or one checklist, with a panel label + badge on its first
line. One per purpose; never stack them as a grid of identical cards.
A checklist panel (e.g. `PreflightBand`) is **collapsible from its header**: icon + panel label + one-line summary + chevron. It is
open while working, stays open and can't be folded while anything fails, and once all green folds to its header (green tint) when
the user clicks elsewhere or moves on. Re-running opens it again.

### Status badge (`StatusBadge`)
Tones: `neutral` (draft/idle), `key` (encrypted/executing), `verified`, `pending`, `failed`. `pulse` only while something is running.

### Confidential value (`Cipher`, `SealedAmount`)
Every amount renders through `Cipher` with `revealed={keys.ready}` (plus `delay={i * 70-90}` in lists so a table decrypts as a
wave). Pass `size="hero"` for a card's headline amount and `size="row"` for an amount in a list; these ARE the Hero / Row figure
styles above, so don't restyle a `Cipher` by hand. A saved amount that cannot be opened renders `SealedAmount`. Never print a confidential amount with plain `formatUsdc`
unless the viewer typed it (e.g. a form total).

### Action button (`ProgressButton`)
The single primary action of a control area. Idle: its label and icon. Working: it keeps its size, a fill grows to the real progress
and the label follows the real step ("Checking 3 of 5…", "Paying 1 of 6 · Verify", "Encrypting & saving…"). Done: green fill and
a popped check. Follow-up actions (e.g. "New run" / "Overview") open below it with `Reveal`.

### Process flow (`Flow`, `src/components/crypto/flow.tsx`; also `KeyDerivation`)
Any multi-step process (a payment, a signature, key derivation) is a row of round icon nodes joined by dashed rails:
- `idle`: hairline circle, muted icon. `active`: key wash + indigo icon + a slowly turning dashed ring. `waiting` (on the user or the
  wallet): the same plus the `lock-pulse` halo. `done`: solid green with a popped check. `error`: red.
- The rail behind a done node draws in green (`stroke-dashoffset`); the rail into a working node carries a moving packet
  (`flow-packet`). Under the flow: one plain sentence of what is happening now.
- Show only real states and real values. **No random hex, no fake progress, no fingerprint colour blocks.**

### Step list (`StepList`, `src/components/crypto/step-list.tsx`)
The vertical `Flow`, for a process explained step by step (withdraw, activation, company setup). Each row: a round icon node
(numbered when a step has no icon), label with its `Encrypted` (`key`) / `Public` (`pending`) badge on the same line, and one sentence
of detail. Same node states as `Flow` (`waiting` = the wallet has been asked), dashed rails that draw green under done steps and carry a
packet (`flow-packet-y`) into the working one. One key-wash highlight **slides** (transform, 500ms) to the working row and turns
`bg-failed-soft` on the step a run stopped on (`failedAt`). Under the working step, `now` opens in place with one plain sentence of the
real engine stage ("Waiting for your wallet to approve the withdrawal"). No hex churn.

### Wallet approval (`SignaturePrompt`)
Appears in place when the engine reports a wallet request. Title "Approve in your wallet · {name}", the engine's own explanation, a
`Flow` (built in this tab → your wallet → devnet), real seconds left, and a hairline bar draining to the real deadline (amber under
10 s). Turns into "Signed" briefly when approved; a declined request just closes.

### Run pages (`run-payroll-parts.tsx`)
Run payroll and Split payout are the same page shape and share one kit: work plate (rows that turn into lanes) + sticky
**Run control** (total panel, `SigningCard`, one `ProgressButton`, `PhaseRail`, lock note). Shared: `usePreflight` + `PreflightBand`,
`SignaturePrompt`, `RetryFailedAlert`, `LaneMark` + `laneSteps` / `laneStatus` / `laneDetail`, `StartOverButton`, `runStatus` /
`runFlow`. Phases are `review → simulating → simulated → executing → done`. A third run-like page reuses these, it does not copy them.
On Split payout the destinations are a **checklist of saved addresses** (like `AddPayroll`): ticking one opens its share field in place
and fills it with what is still unassigned; "Split evenly" in the header strip shares 100% out. The primary shows a `Primary` badge and
other ticked rows get a "Make primary" pill on hover (always visible on touch). Rows and the header strip share fixed column widths
(share, amount) so figures line up; on phones the amount column folds into the address line while editing. The invoice band folds away
once checks start, unticked rows fold away, and share and amount top-align with the name line. The allocation bar is indigo (primary solid, others a tint) with the
unassigned rest as a dashed slot; no categorical hues (they would collide with green/amber/red).

### Audit log (`auditor-live.tsx`, `/app/auditor`)
Work + control. Work: a "Payments" plate whose list area holds one in-plate message (icon, title, one sentence; `orb-ripple` while
reading) until there are rows, a hairline track under the header that `sweep`s only while devnet is being read or a page decrypted,
and a pager footer (Newer / Older, "Page 2 of 4", or "older history still on devnet"). Control: an "Auditor key" plate; its form
(employer wallet, secret, a `Flow` of Check key → Find vault → Read history that opens with `Reveal` once started or failed, and a
`ProgressButton`) closes in place and the session opens in its spot (a "Decrypted so far" hero `Cipher`, employer and vault
addresses with copy, then the auditor public key under a hairline in base64 with a tooltip, because it is an ElGamal key and not
an account, and Lock and clear). **Paged decryption:** pages hold 10 payments and each is decrypted the first time it is shown:
its rows mount as real ciphertext (`cipherPreview` of the lo ciphertext), then open as a wave (`delay={i * 80}`); a page seen before
is shown already open. The sealed rows stay at least 350 ms so a fast decrypt still reads as encrypted → decrypted.

### Lifecycle rail (`PhaseRail`)
Vertical list of a run's states with drawing connectors. Reached states are green checks; the current one is an indigo ring that
pulses; a terminal "Done" is a check, not a ring; a failure is red.

### Lists and rows
Hairline-divided rows (`border-b border-border/60`), `row-hover` on interactive rows, a `bg-muted/30` header strip with
`text-[11px]` column labels. A row that is working gets `bg-accent/35`; a failed row `bg-failed-soft/50`. Rows that open into detail
use `Reveal`; only the row that is working (or failed) opens, others stay one line.

### Selectable list item (e.g. `PayrollRail`)
`rounded-xl px-2.5 py-2.5`; a `size-8 rounded-lg` initials tile (indigo when selected, mist otherwise); name + one meta line
(count · encrypted total); selected = `bg-accent/60` + indigo check. Uses `role="radio"`/`aria-checked`.

### Forms in sheets (e.g. `AddPayroll`)
Right sheet, full width on phones (`data-[side=right]:w-full sm:max-w-md`), `p-0` with three zones: header (icon tile + title +
one-line description, `border-b`), scrolling body (`px-6 py-5 gap-6`), pinned footer (`bg-muted/20 border-t`) holding the live
summary, a lock note on what is encrypted, and a full-width `ProgressButton`. Pick from existing records with a **checklist**
(tick reveals the row's own field in place), not dropdowns plus "add row". Labels `text-xs font-semibold`; errors appear in
place under the field or row in `text-destructive`, after the first submit attempt.

### Settings dialogs (e.g. `OperatorModal`)
Same three zones as a form sheet, inside a `DialogContent` with `p-0 gap-0`: header (icon tile + title + `StatusBadge` on one line,
one-sentence description, `border-b`), body (`px-6 py-5`, settings as plain label/control rows, no boxed cards), footer
(`bg-muted/20 border-t`) with one full-width `ProgressButton` and a single caption line under it for secondary info or a text-link
action. While the thing is live, the settings rows are replaced by one inner panel of hero figures (e.g. time left / payments left).
Small integer inputs use a **stepper** (− mono value +, `h-9 rounded-lg border-input`), not a bare number field.

### Choice dialog (`StartChooser`)
For "pick one path" questions (e.g. where a fresh wallet starts). Same three zones as a settings dialog. Body is a vertical
`role="radiogroup"` of bordered `rounded-xl` option rows: `size-8 rounded-lg` icon tile (indigo when selected, mist otherwise), title +
one-line blurb, and a round radio tick on the right. Selecting a row tints it (`bg-accent/60`) and opens its numbered first steps in
place with `Reveal`. Nothing is preselected; the footer `ProgressButton` reads "Choose one to continue" until a choice, then names
the destination ("Set up my company"). Options come from a data array, so a new role (auditor) is one more entry.

### Key state (`KeyChip`, `LockIcon`, `UnlockDialog`)
Key state is always visible in the top bar: the chip pulses while locked, the shackle lifts on unlock, and the unlock dialog draws
the real derivation with `KeyDerivation` (signature → ElGamal key + AES key). Anything that needs keys calls `keys.requireKeys()`,
which opens that dialog; a button that cannot work without keys says so in its label ("Unlock keys & simulate").

### Segmented controls (`Segmented`)
One indicator slides by transform between options. Use for 2-4 mutually exclusive views, not for navigation.

### Feedback
Results of background work go to `sonner` toasts; inline alerts (`role="alert"`, `bg-failed-soft`) only for something the user
must act on in place (e.g. "Retry failed"). Never a modal for progress.

### Tooltips (`InfoTooltip`, `components/ui/tooltip.tsx`)
A small white plate: `bg-popover`, 1px hairline border, `rounded-xl`, soft plate-style shadow, `text-xs leading-relaxed` ink text,
max ~17rem wide. The arrow is the same white with the border on its two outward edges only. Fades and scales in from 0.97 over
150ms (`--ease-out`), exits in 100ms. The `i` trigger is Graphite and turns Key Indigo on hover / while open. No dark fill, no
translucency or blur. Style lives in `TooltipContent`; don't override it per use. Content is one or two plain sentences.

### Empty states (`EmptyState`)
Icon, one-line title that names the next step ("Create your first payroll"), one sentence, and the action button.

### Page loading (`PageLoading`)
Whole-page wait while chain/D1 state is read. Centred in the content area (`min-h-[50vh]`): a `size-14 rounded-2xl` Key Wash tile
with a block glyph and two staggered `orb-ripple` rings, the label (`text-sm font-semibold`, says what is being read), a churning
`HexTicker`, and a 2px indigo `sweep` track. Fades in after 180ms so a fast read shows nothing. No skeletons of the page behind it
(they guess at a layout the page may not have).

## Motion

Easing `--ease-out` (cubic-bezier(.16,1,.3,1)); 150ms feedback, 260ms state change, 500-700ms layout and draws. Keyframes in
`globals.css`: `enter` (rise + unblur, 55ms stagger via `--i`), `fade`, `pop`, `resolve-flash`, `lock-pulse`, `dot-pulse`,
`flow-packet`, `flow-packet-y`, `orb-ripple`, `sweep`.
- Open/close in place with `Reveal` (grid rows 0fr→1fr) or a grid-column transition; never swap whole sections.
- Exits faster than entrances. No bounce/elastic.
- Everything is covered by the global `prefers-reduced-motion` rule; `HexTicker` and `Flow` packets also stop themselves. State must
  still be readable without motion (colour + icon + text).

## Do's and Don'ts

**Do**
- Reuse `PageHeader`, `.plate`, `StatusBadge`, `Cipher`, `ProgressButton`, `Flow`, `Reveal`, `EmptyState` before writing anything new.
- Show amounts as ciphertext until keys are unlocked; say what is encrypted and what is public near any amount.
- Drive every animation from real state (engine stage, real deadline, real signature).
- Keep one primary action per control area.
- Check every change at 1440px and 390px.

**Don't**
- Don't add random hex churn, fake progress, or colour-block fingerprints as decoration.
- Don't use horizontally scrolling card strips, dropdowns detached from what they control, or "add row" builders when a checklist works.
- Don't add gradients, glass, glows, dark sections, kickers above headings, or side-stripe borders.
- Don't nest shadowed cards, and don't build pages out of grids of identical icon+heading+text cards.
- Don't use mono for non-data text, or green/amber/red as decoration.

## Open notes
- "Cipherpay" and its mark (`components/app/brand.tsx`) are placeholders until the product name is decided.
- Previous language still in use, to migrate to this system when those screens are next touched: a `Fingerprint` colour block
  on the auditor page. New work uses `Flow` and plain addresses.
  (`PipelineTrack` is now only on the landing page demo.)
