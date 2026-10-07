// Pure helpers for running a split payout on the real chain: which destinations are usable, and which of the split's parts become payments.
import { isAddress } from "@solana/kit";
import { BPS_TOTAL, type SplitDestination, type SplitPart } from "./split";
import type { LiveItem } from "./use-live-run";

export interface SplitTarget {
  id: string;
  name: string;
  wallet: string;
}

/**
 * One message per destination that can't be paid as entered, or null when it is fine: not an address, or the same wallet as another
 * destination (paying the same account twice would double up its balance and hide the split from anyone reading it).
 */
export function checkSplitWallets(targets: SplitTarget[], opts: { requireValid?: boolean } = {}): Record<string, string | null> {
  const requireValid = opts.requireValid ?? true;
  const out: Record<string, string | null> = {};
  for (const t of targets) {
    const wallet = t.wallet.trim();
    const clash = targets.find((o) => o.id !== t.id && o.wallet.trim() === wallet);
    out[t.id] = !wallet ? "Enter a wallet address." : requireValid && !isAddress(wallet) ? "That is not a valid Solana address." : clash ? `Already used for ${clash.name}.` : null;
  }
  return out;
}

/** The payments a split turns into. A destination at 0% has nothing to pay (a zero-value payment is refused), so it is left out. */
export function splitRunItems(parts: SplitPart[], targets: SplitTarget[]): LiveItem[] {
  return parts.flatMap((p) => {
    const t = targets.find((x) => x.id === p.id);
    return t && p.amount > 0n ? [{ id: p.id, name: t.name, wallet: t.wallet.trim(), amount: p.amount }] : [];
  });
}

/** One line of a split the admin is building. `pct` is the text in the box ("79", "12.5"), kept as typed so editing feels natural. */
export interface SplitRow {
  key: string;
  name: string;
  wallet: string;
  pct: string;
}

/** Each destination is a payment of about 30 s and six transactions, so a split is capped well before it becomes a long-running job. */
export const MAX_SPLIT_ROWS = 10;
const MAX_NAME = 80; // the same limit the server puts on a recorded name

/** "79" or "12.5" or "0.25" -> basis points (7900, 1250, 25). Null for anything else: negative, above 100, more than 2 decimals, not a number. */
export function parsePercentBps(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= BPS_TOTAL ? bps : null;
}

export interface SplitRowErrors {
  name?: string;
  wallet?: string;
  pct?: string;
}

export interface SplitCheck {
  errors: Record<string, SplitRowErrors>;
  /** Basis points per row (0 for a row whose percentage can't be read yet). */
  bps: Record<string, number>;
  sumBps: number;
  /** What is still unassigned (negative when over 100%). */
  remainingBps: number;
  sumValid: boolean;
  /** True when the rule itself is complete and consistent. Whether the wallets are set up and the treasury covers it is checked separately. */
  ok: boolean;
}

/**
 * Checks a split rule as the admin typed it. `validateAddresses` is on for real wallets; the demo uses made-up wallet strings that aren't real
 * addresses, so it only requires them to be filled in and distinct.
 */
export function checkSplit(rows: SplitRow[], primaryKey: string, opts: { validateAddresses: boolean }): SplitCheck {
  const wallets = checkSplitWallets(rows.map((r) => ({ id: r.key, name: r.name.trim() || "another row", wallet: r.wallet })), { requireValid: opts.validateAddresses });
  const errors: Record<string, SplitRowErrors> = {};
  const bps: Record<string, number> = {};
  let sumBps = 0;
  for (const r of rows) {
    const e: SplitRowErrors = {};
    const name = r.name.trim();
    if (!name) e.name = "Enter a name.";
    else if (name.length > MAX_NAME) e.name = `Keep the name under ${MAX_NAME} characters.`;
    if (wallets[r.key]) e.wallet = wallets[r.key]!;
    const parsed = parsePercentBps(r.pct);
    if (parsed === null) e.pct = "Enter a percentage from 0 to 100 (up to 2 decimals).";
    else if (r.key === primaryKey && parsed === 0) e.pct = "The primary recipient needs more than 0%.";
    bps[r.key] = parsed ?? 0;
    sumBps += parsed ?? 0;
    if (Object.keys(e).length) errors[r.key] = e;
  }
  const sumValid = sumBps === BPS_TOTAL;
  const ok = rows.length >= 1 && rows.length <= MAX_SPLIT_ROWS && rows.some((r) => r.key === primaryKey) && sumValid && Object.keys(errors).length === 0;
  return { errors, bps, sumBps, remainingBps: BPS_TOTAL - sumBps, sumValid, ok };
}

/** The rule in the shape splitAmount wants. The primary recipient absorbs the rounding remainder so the parts add up exactly. */
export function toDestinations(rows: SplitRow[], bps: Record<string, number>, primaryKey: string): SplitDestination[] {
  return rows.map((r) => ({ id: r.key, label: r.name.trim(), bps: bps[r.key] ?? 0, primary: r.key === primaryKey }));
}
