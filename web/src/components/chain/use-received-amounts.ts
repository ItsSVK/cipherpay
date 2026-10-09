"use client";

import type { Address } from "@solana/kit";
import { useEffect, useState } from "react";
import { useKeys } from "@/components/crypto/key-context";
import type { ReceivedPayment } from "@/components/data/payroll-data";
import { checkReceivedAgainstChain, type ReceivedCheck } from "@/lib/chain/received-check";
import { rpc } from "@/lib/chain/rpc";
import { openReceivedAmounts } from "@/lib/crypto/proof-client";

/**
 * What the recipient can say about one payment's amount.
 * - `none`: the employer's record has no amount for this wallet (saved before this existed).
 * - `locked`: keys are locked, or decryption is still running.
 * - `checking`: decrypted, now being compared with the on-chain payment.
 * - `ready`: decrypted and matches the chain (`verified`), or the chain could not be asked (`verified` false).
 * - `invalid`: it does not decrypt under this wallet's key, or does not match the on-chain payment. The amount is withheld.
 */
export type ReceivedAmount = { status: "none" | "locked" | "checking" | "invalid"; amount: null } | { status: "ready"; amount: bigint; verified: boolean };

/** Chain checks don't depend on the keys, so they survive lock/unlock and re-renders. Keyed by signature + ciphertext. */
const checks = new Map<string, Promise<ReceivedCheck>>();
const CHECK_CONCURRENCY = 3;

function checkOnce(signature: string, tokenAccount: Address, received: string): Promise<ReceivedCheck> {
  const k = `${signature}:${tokenAccount}:${received}`;
  let p = checks.get(k);
  if (!p) {
    p = checkReceivedAgainstChain(rpc, signature, tokenAccount, received);
    checks.set(k, p);
    // An RPC hiccup shouldn't stick for the whole session: forget it so the next load asks again.
    void p.then((r) => r === "unavailable" && checks.delete(k));
  }
  return p;
}

/** Opens each payment's amount with this wallet's key (off the main thread), then checks it against the on-chain pay_employee. */
export function useReceivedAmounts(payments: ReceivedPayment[], tokenAccount: Address | null): Map<string, ReceivedAmount> {
  const keys = useKeys();
  const { ready, getKeys, epoch } = keys;
  const listKey = payments.map((p) => `${p.id}:${p.receivedAmountCt ?? ""}`).join("|");
  const [state, setState] = useState<{ key: string; amounts: Map<string, ReceivedAmount> } | null>(null);
  const runKey = `${epoch}:${tokenAccount ?? ""}:${listKey}`;

  useEffect(() => {
    if (!ready || !tokenAccount) return;
    const k = getKeys();
    const sealed = payments.filter((p) => p.receivedAmountCt);
    if (!k || sealed.length === 0) return;
    let cancelled = false;
    const amounts = new Map<string, ReceivedAmount>();
    const publish = () => !cancelled && setState({ key: runKey, amounts: new Map(amounts) });
    (async () => {
      let opened: (bigint | null)[];
      try {
        opened = await openReceivedAmounts(sealed.map((p) => p.receivedAmountCt), k);
      } catch {
        opened = sealed.map(() => null);
      }
      const toCheck: { p: ReceivedPayment; amount: bigint }[] = [];
      sealed.forEach((p, i) => {
        const amount = opened[i];
        if (amount === null || amount === undefined) amounts.set(p.id, { status: "invalid", amount: null });
        else {
          amounts.set(p.id, { status: "checking", amount: null });
          toCheck.push({ p, amount });
        }
      });
      publish();
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < toCheck.length) {
          const { p, amount } = toCheck[next++];
          const result = await checkOnce(p.signature, tokenAccount, p.receivedAmountCt!);
          amounts.set(p.id, result === "mismatch" ? { status: "invalid", amount: null } : { status: "ready", amount, verified: result === "match" });
          publish();
        }
      };
      await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, toCheck.length) }, worker));
    })();
    return () => {
      cancelled = true;
    };
    // payments is covered by listKey (inside runKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, getKeys, runKey, tokenAccount]);

  const current = ready && state?.key === runKey ? state.amounts : null;
  return new Map(payments.map((p) => [p.id, !p.receivedAmountCt ? { status: "none", amount: null } : (current?.get(p.id) ?? { status: "locked", amount: null })]));
}
