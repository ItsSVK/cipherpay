"use client";

import { useEffect, useState } from "react";
import { useKeys } from "@/components/crypto/key-context";
import { decryptAccountBalance, type DecryptedBalance } from "@/lib/chain/decrypt";
import type { ConfidentialAccountView } from "@/lib/chain/read";

export type BalanceStatus = "none" | "locked" | "decrypting" | "ready" | "error";

const hex = (b: ArrayLike<number> | undefined) => (b ? Array.from(b as ArrayLike<number>, (n) => n.toString(16).padStart(2, "0")).join("") : "");

/**
 * Decryption is ~370 ms of MAIN-THREAD work, and several hooks (useVault, useEmployee) ask for the same account on the same
 * page. Keyed by the exact ciphertexts, so one decrypt is shared instead of two or three identical ones running back to back.
 */
const inFlight = new Map<string, Promise<DecryptedBalance>>();

function decryptOnce(key: string, view: ConfidentialAccountView, keys: Parameters<typeof decryptAccountBalance>[1]): Promise<DecryptedBalance> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = decryptAccountBalance(view, keys).finally(() => {
    // Only dedupes work that overlaps: the hook already remembers the result for a key that has not changed.
    setTimeout(() => inFlight.delete(key), 2_000);
  });
  inFlight.set(key, p);
  return p;
}

/**
 * Decrypts one confidential account's balances while keys are unlocked. Locking drops the plaintext.
 * `none` = no confidential account to decrypt; `locked` = keys not unlocked.
 */
export function useConfidentialBalance(view: ConfidentialAccountView | null): { status: BalanceStatus; balance: DecryptedBalance | null; error: string | null } {
  const keys = useKeys();
  const ready = keys.ready;
  const getKeys = keys.getKeys;
  const epoch = keys.epoch;

  // Re-decrypt only when the on-chain ciphertexts actually change, not on every poll.
  const ext = view && view.confidential ? (view.token.extensions.__option === "Some" ? view.token.extensions.value.find((e) => e.__kind === "ConfidentialTransferAccount") : undefined) : undefined;
  const key =
    view && ext && ext.__kind === "ConfidentialTransferAccount"
      ? [epoch, view.address, hex(ext.availableBalance as unknown as ArrayLike<number>), hex(ext.pendingBalanceLow as unknown as ArrayLike<number>), hex(ext.pendingBalanceHigh as unknown as ArrayLike<number>), hex(ext.decryptableAvailableBalance as unknown as ArrayLike<number>)].join(":")
      : null;

  const [result, setResult] = useState<{ key: string; balance: DecryptedBalance | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!ready || !view || !key) return;
    let cancelled = false;
    (async () => {
      const k = getKeys();
      if (!k) return;
      try {
        const balance = await decryptOnce(key, view, k);
        if (!cancelled) setResult({ key, balance, error: null });
      } catch (e) {
        if (!cancelled) setResult({ key, balance: null, error: e instanceof Error ? e.message : "Could not decrypt." });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `view` is intentionally omitted: `key` already changes whenever the ciphertexts do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, getKeys]);

  // Hard rule: when keys are cleared, drop anything decrypted under them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ready) setResult(null);
  }, [ready]);

  if (!view || !view.confidential || !key) return { status: "none", balance: null, error: null };
  if (!ready) return { status: "locked", balance: null, error: null };
  if (result && result.key === key) return result.error ? { status: "error", balance: null, error: result.error } : { status: "ready", balance: result.balance, error: null };
  return { status: "decrypting", balance: null, error: null };
}
