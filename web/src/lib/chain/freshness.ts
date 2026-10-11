// Monotonic reads. A dedicated RPC endpoint is several nodes behind a load balancer, and those nodes are not at the same slot: measured on
// our devnet endpoint (2026-10-11), 7 of 48 parallel `confirmed` reads answered from an OLDER slot than one already received. So two reads
// in a row can go backwards in time: a payment we just confirmed "un-happens", an authorization we just revoked looks live again.
//
// The fix is the RPC's own `minContextSlot`: we remember the newest slot we know of (from every confirmed transaction and every read that
// reports one) and ask every read to come from at least that slot. A node that is behind answers "minimum context slot not reached"
// instead of stale data, and `fresh` asks again.
import { isSolanaError, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED, type Slot } from "@solana/kit";

let floor = 0n;

/** Records a slot the chain is known to have reached (a confirmed transaction's slot, a read's context slot). Never moves backwards. */
export function noteSlot(slot: bigint | number | null | undefined): void {
  if (slot === null || slot === undefined) return;
  const s = BigInt(slot);
  if (s > floor) floor = s;
}

/** The slot every read must be at least at, or undefined before we know of any. */
export function minContextSlot(): Slot | undefined {
  return floor > 0n ? floor : undefined;
}

function isBehind(e: unknown): boolean {
  return (
    isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED) ||
    isSolanaError((e as { cause?: unknown } | null)?.cause, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a read pinned to the newest known slot, asking again while the node that answers is behind it. A slot is ~0.4 s and the lag we
 * measured was 2 slots, so a few short retries are enough.
 */
export async function fresh<T>(read: (minContextSlot: Slot | undefined) => Promise<T>, tries = 10, waitMs = 300): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read(minContextSlot());
    } catch (e) {
      if (!isBehind(e) || attempt >= tries - 1) throw e;
      await sleep(waitMs);
    }
  }
}

/** Test hook. */
export function resetFreshnessForTests(): void {
  floor = 0n;
}
