"use client";

import { useEffect, useMemo, useState } from "react";
import { useKeys } from "@/components/crypto/key-context";
import { openAmount, recordKeyFor, sealAmount } from "@/lib/crypto/record-seal";
import type { Payroll, Run } from "@/lib/mock/data";
import { amountContext } from "@/lib/sealed-amount";
import { usePayrollData, type LegacySeal, type SealedPayroll, type SealedRun } from "./payroll-data";

/** locked: keys not unlocked, amounts hidden. opening: decrypting. open: every amount that could be read is shown. */
export type RecordsStatus = "locked" | "opening" | "open";

interface Opened {
  payrolls: SealedPayroll[];
  runs: SealedRun[];
  epoch: number;
  open: { payrolls: Payroll[]; runs: Run[]; unreadable: number };
}

const runDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
const runStatus = (s: string): Run["status"] => (s === "done" ? "done" : "failed");

/** What a view shows while the amounts are not open: the list and names, with `sealed` set and 0n placeholders. */
const sealedPayroll = (p: SealedPayroll): Payroll => ({ id: p.id, name: p.name, sealed: true, entries: p.entries.map((e) => ({ id: e.addressId, name: e.name, wallet: e.wallet, amount: 0n, amountCt: e.amountCt })) });
const sealedRun = (r: SealedRun): Run => ({ id: r.id, label: r.label, date: runDate(r.createdAt), status: runStatus(r.status), recipients: r.recipients, total: 0n, sealed: true, items: r.items.map((i) => ({ wallet: i.wallet, name: i.name, amount: 0n, signature: i.signature })) });

/**
 * The connected admin's payrolls and run history with their amounts decrypted in this tab, while the keys are unlocked.
 * Locking (or a wallet change) drops the decrypted figures at once: the views go back to the sealed placeholders, and nothing
 * needs re-encrypting because the server only ever held ciphertext. Rows saved before sealing existed are shown from their old
 * plaintext once, and sealed in the background so the plaintext is cleared from the database.
 */
export function useOpenRecords(employer: string, enabled: boolean): { payrolls: Payroll[]; runs: Run[]; status: RecordsStatus; unreadable: number } {
  const data = usePayrollData();
  const keys = useKeys();
  const [opened, setOpened] = useState<Opened | null>(null);
  const { payrolls, runs, sealLegacy } = data;
  const { ready, epoch, getKeys } = keys;

  useEffect(() => {
    const k = enabled && ready ? getKeys() : null;
    if (!k) return;
    let cancelled = false;
    void (async () => {
      const key = await recordKeyFor(k);
      let unreadable = 0;
      const legacy: LegacySeal = { entries: [], runs: [], items: [] };
      const open = async (ct: string | null, plain: string | null, context: string, onLegacy: (ct: string) => void): Promise<bigint | null> => {
        if (ct !== null) {
          try {
            return await openAmount(key, ct, context);
          } catch {
            unreadable += 1;
            return null;
          }
        }
        if (plain === null) return null;
        const amount = BigInt(plain);
        onLegacy(await sealAmount(key, amount, context));
        return amount;
      };

      const openPayrolls = await Promise.all(
        payrolls.map(async (p): Promise<Payroll> => {
          const amounts = await Promise.all(p.entries.map((e) => open(e.amountCt, e.legacyAmount, amountContext.payrollEntry(employer, p.id, e.addressId), (amountCt) => legacy.entries.push({ payrollId: p.id, addressId: e.addressId, amountCt }))));
          if (amounts.some((a) => a === null)) return sealedPayroll(p);
          return { id: p.id, name: p.name, entries: p.entries.map((e, i) => ({ id: e.addressId, name: e.name, wallet: e.wallet, amount: amounts[i]!, amountCt: e.amountCt })) };
        }),
      );
      const openRuns = await Promise.all(
        runs.map(async (r): Promise<Run> => {
          const total = await open(r.totalCt, r.legacyTotal, amountContext.runTotal(employer, r.id), (totalCt) => legacy.runs.push({ id: r.id, totalCt }));
          const amounts = await Promise.all(r.items.map((i) => open(i.amountCt, i.legacyAmount, amountContext.runItem(employer, r.id, i.wallet), (amountCt) => legacy.items.push({ id: i.id, amountCt }))));
          if (total === null || amounts.some((a) => a === null)) return sealedRun(r);
          return { id: r.id, label: r.label, date: runDate(r.createdAt), status: runStatus(r.status), recipients: r.recipients, total, items: r.items.map((i, n) => ({ wallet: i.wallet, name: i.name, amount: amounts[n]!, signature: i.signature })) };
        }),
      );
      if (cancelled) return;
      setOpened({ payrolls, runs, epoch, open: { payrolls: openPayrolls, runs: openRuns, unreadable } });
      // Best effort: if it fails the plaintext stays until the next unlock tries again. Nothing to tell the user meanwhile.
      if (legacy.entries.length + legacy.runs.length + legacy.items.length > 0) sealLegacy(legacy).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, epoch, getKeys, payrolls, runs, employer, sealLegacy]);

  return useMemo(() => {
    // Only figures opened from THIS data under THESE keys count; anything older is dropped the moment keys lock or data changes.
    if (enabled && ready && opened && opened.epoch === epoch && opened.payrolls === payrolls && opened.runs === runs) return { ...opened.open, status: "open" as const };
    return { payrolls: payrolls.map(sealedPayroll), runs: runs.map(sealedRun), status: enabled && ready ? ("opening" as const) : ("locked" as const), unreadable: 0 };
  }, [enabled, ready, opened, epoch, payrolls, runs]);
}
