export interface SplitDestination {
  id: string;
  label: string;
  /** Basis points out of 10_000 (79% = 7900). */
  bps: number;
  primary?: boolean;
}

export interface SplitPart {
  id: string;
  label: string;
  amount: bigint;
}

export const BPS_TOTAL = 10_000;

/**
 * Split `total` base units by basis points. Each non-primary destination gets
 * floor(total * bps / 10_000); the primary absorbs the remainder so parts sum exactly to total.
 * Percentages are client-side policy: the program cannot verify them (amounts are encrypted).
 */
export function splitAmount(total: bigint, destinations: SplitDestination[]): SplitPart[] {
  if (total < 0n) throw new Error("total must be non-negative");
  const sum = destinations.reduce((n, d) => n + d.bps, 0);
  if (sum !== BPS_TOTAL) throw new Error(`percentages must sum to 100% (got ${sum / 100}%)`);
  const primaries = destinations.filter((d) => d.primary);
  if (primaries.length !== 1) throw new Error("exactly one primary destination is required");

  const parts = destinations.map((d) => ({
    id: d.id,
    label: d.label,
    amount: d.primary ? 0n : (total * BigInt(d.bps)) / BigInt(BPS_TOTAL),
  }));
  const others = parts.reduce((n, p) => n + p.amount, 0n);
  const primary = parts.find((p) => p.id === primaries[0].id)!;
  primary.amount = total - others;
  return parts;
}
