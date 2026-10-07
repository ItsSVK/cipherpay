// Pure helpers for running a split payout on the real chain: which destinations are usable, and which of the split's parts become payments.
import { isAddress } from "@solana/kit";
import type { SplitPart } from "./split";
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
export function checkSplitWallets(targets: SplitTarget[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const t of targets) {
    const wallet = t.wallet.trim();
    const clash = targets.find((o) => o.id !== t.id && o.wallet.trim() === wallet);
    out[t.id] = !wallet ? "Enter a wallet address." : !isAddress(wallet) ? "That is not a valid Solana address." : clash ? `Already used for ${clash.name}.` : null;
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
