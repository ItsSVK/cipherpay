"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/app/segmented";
import { WalletCountdown } from "@/components/app/wallet-countdown";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import { deriveHelperSigner, helperBalance, revokeAndReclaim, sweepHelper } from "@/lib/chain/helper-signer";
import { OPERATOR_TTL_OPTIONS, readOperator, type OperatorStatus } from "@/lib/chain/operator";
import { rpc } from "@/lib/chain/rpc";
import { cn } from "@/lib/utils";

/** What the admin chose on the payroll page. */
export interface AutoPayrollSettings {
  /** On: payments are signed by the payroll helper after one approval. Off: the wallet approves every payment. */
  enabled: boolean;
  ttlSeconds: number;
  /** Null means "exactly the people in this run". */
  maxPayments: number | null;
}

export const DEFAULT_AUTO_SETTINGS: AutoPayrollSettings = { enabled: false, ttlSeconds: 60 * 60, maxPayments: null };

const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);

function timeLeft(expiresAt: bigint, nowMs: number): string {
  const secs = Number(expiresAt) - Math.floor(nowMs / 1000);
  if (secs <= 0) return "expired";
  if (secs < 90) return `${secs}s`;
  if (secs < 3600 * 2) return `${Math.round(secs / 60)} min`;
  return `${(secs / 3600).toFixed(1)} h`;
}

/**
 * The switch between AUTOMATIC payroll (one approval, then the payroll helper key signs every payment, within an expiry and a
 * payment count) and MANUAL payroll (the wallet approves each payment). Also where an authorization is revoked and the helper's
 * SOL reclaimed. The authorization itself lives on-chain (`set_operator`), so this panel reads it from there.
 */
export function OperatorPanel({ settings, onChange, recipients, locked }: { settings: AutoPayrollSettings; onChange: (next: AutoPayrollSettings) => void; recipients: number; locked: boolean }) {
  const keys = useKeys();
  const { signer } = useTxSigner();
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const helperRef = useRef<Awaited<ReturnType<typeof deriveHelperSigner>> | null>(null);

  const ready = keys.ready && !!signer;
  const refresh = useCallback(async () => {
    const k = keys.getKeys();
    if (!k || !signer) return;
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      const helper = helperRef.current;
      const [op, bal] = await Promise.all([readOperator(rpc, address(signer.address), helper.address, 1), helperBalance(rpc, helper)]);
      setStatus(op);
      setBalance(bal);
    } catch {
      // A failed read just leaves the last known status; the next poll tries again.
    }
  }, [keys, signer]);

  useEffect(() => {
    if (!ready) {
      helperRef.current = null;
      return;
    }
    void refresh();
    const id = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [ready, refresh, locked]);

  const live = !!status && status.operator !== null && status.expiresAt > BigInt(Math.floor(now / 1000)) && status.paymentsLeft > 0;
  const cap = settings.maxPayments ?? recipients;

  const revoke = async () => {
    const helper = helperRef.current;
    if (!signer || !helper) return;
    setBusy(true);
    try {
      // Nothing to revoke: just bring the helper's SOL home. That needs no wallet approval.
      if (!live) {
        const back = await sweepHelper({ rpc, admin: signer, helper });
        toast.success("SOL returned", { description: `${sol(back)} SOL moved from the payroll helper to your wallet.` });
        return;
      }
      const back = await revokeAndReclaim({
        rpc,
        admin: signer,
        helper,
        onPrompt: ({ expiresAtMs }) => setDeadline(expiresAtMs),
        onSigned: () => setDeadline(null),
      });
      toast.success("Automatic payroll turned off", { description: back > 0n ? `${sol(back)} SOL returned from the payroll helper to your wallet.` : "The helper had no SOL to return." });
      onChange({ ...settings, enabled: false });
    } catch (e) {
      toast.error("Couldn't turn it off", { description: e instanceof Error ? e.message : "The approval failed. Nothing changed." });
    } finally {
      setDeadline(null);
      setBusy(false);
      void refresh();
    }
  };

  return (
    <section className="plate enter p-5" aria-label="Automatic payroll" style={{ ["--i" as string]: 2 }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-sans text-sm font-semibold tracking-normal">Automatic payroll</h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            {settings.enabled
              ? "You approve once, then your payroll helper pays everyone with no more wallet popups, until the time or payment limit below runs out."
              : "Off: your wallet will ask you to approve each payment, one by one."}
          </p>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(on) => onChange({ ...settings, enabled: on })} disabled={locked || busy} aria-label="Automatic payroll" />
      </div>

      {settings.enabled ? (
        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Turn itself off after</p>
            <Segmented
              label="How long automatic payroll stays on"
              value={String(settings.ttlSeconds)}
              onChange={(v) => onChange({ ...settings, ttlSeconds: Number(v) })}
              options={OPERATOR_TTL_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))}
            />
          </div>
          <div>
            <label htmlFor="max-payments" className="mb-1.5 block text-xs font-medium text-muted-foreground">Most payments it may make</label>
            <input
              id="max-payments"
              type="number"
              min={recipients}
              max={500}
              value={cap}
              disabled={locked || busy}
              onChange={(e) => onChange({ ...settings, maxPayments: Math.max(recipients, Math.min(500, Math.floor(Number(e.target.value) || recipients))) })}
              className="h-9 w-28 rounded-lg border bg-background px-3 font-mono text-sm tnum"
            />
            <p className="mt-1 text-xs text-muted-foreground">At least {recipients}, the people in this run. It can&apos;t limit the amount, because amounts are encrypted.</p>
          </div>
        </div>
      ) : null}

      {ready && (settings.enabled || live) ? (
        <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[13px]", live ? "border-verified/30 bg-verified-soft" : "bg-muted/40")}>
          <div className="min-w-0">
            {live && status ? (
              <p className="font-medium">
                Authorized: {status.paymentsLeft} payment{status.paymentsLeft === 1 ? "" : "s"} left, ends in {timeLeft(status.expiresAt, now)}
              </p>
            ) : (
              <p className="font-medium">Not authorized yet. You&apos;ll approve once when you run payroll.</p>
            )}
            <p className="text-xs text-muted-foreground">Payroll helper holds {balance === null ? "…" : `${sol(balance)} SOL`}.{!settings.enabled && live ? " Automatic payroll is off, but this authorization is still live until you revoke it." : ""}</p>
          </div>
          {live || (balance ?? 0n) > 10_000n ? (
            <Button size="sm" variant="outline" onClick={revoke} disabled={busy || locked}>
              {busy ? "Waiting for your wallet…" : live ? "Revoke and reclaim SOL" : "Reclaim SOL"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {deadline ? <div className="mt-2"><WalletCountdown deadline={deadline} note="Approve the revoke in your wallet. It only ends the authorization." /></div> : null}
      {settings.enabled && !ready ? <p className="mt-3 text-xs text-muted-foreground">Unlock your keys to see the current status.</p> : null}
    </section>
  );
}
