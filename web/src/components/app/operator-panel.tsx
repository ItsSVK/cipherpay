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
import { deriveHelperSigner, ensureHelperReady, helperBalance, revokeAndReclaim, sweepHelper } from "@/lib/chain/helper-signer";
import { OPERATOR_TTL_OPTIONS, readOperator, type OperatorStatus } from "@/lib/chain/operator";
import { rpc } from "@/lib/chain/rpc";
import { cn } from "@/lib/utils";

/** What the admin chose on the payroll page. `enabled` mirrors the chain: it is true exactly while an authorization is live. */
export interface AutoPayrollSettings {
  enabled: boolean;
  ttlSeconds: number;
  /** Null means "exactly the people in this run". */
  maxPayments: number | null;
}

export const DEFAULT_AUTO_SETTINGS: AutoPayrollSettings = { enabled: false, ttlSeconds: 5 * 60, maxPayments: null };

const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

/**
 * The AUTOMATIC payroll switch. Turning it on asks the wallet to approve ONCE, right then (SOL top-up for the payroll helper plus
 * `set_operator`), so any slow wallet popup happens before a run, not in the middle of one. From then until the timer or the payment
 * count runs out, a run is signed by the helper with no popups. Turning it off revokes the authorization and returns the helper's SOL.
 * The switch always mirrors the chain: it is on exactly while an authorization is live, and flips off by itself when it ends.
 */
export function OperatorPanel({ settings, onChange, recipients, locked }: { settings: AutoPayrollSettings; onChange: (next: AutoPayrollSettings) => void; recipients: number; locked: boolean }) {
  const keys = useKeys();
  const { signer } = useTxSigner();
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<null | "authorizing" | "revoking">(null);
  const [wallet, setWallet] = useState<{ deadline: number; note: string } | null>(null);
  const helperRef = useRef<Awaited<ReturnType<typeof deriveHelperSigner>> | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const ready = keys.ready && !!signer;
  const cap = settings.maxPayments ?? recipients;

  const refresh = useCallback(async () => {
    const k = keys.getKeys();
    if (!k || !signer) return;
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      const helper = helperRef.current;
      const [op, bal] = await Promise.all([readOperator(rpc, address(signer.address), helper.address, 1, BigInt(Math.floor(Date.now() / 1000))), helperBalance(rpc, helper)]);
      setStatus(op);
      setBalance(bal);
    } catch {
      // Keep the last known status; the next poll tries again.
    }
  }, [keys, signer]);

  // Chain poll every 20 s, plus a 1 s tick so the countdown moves.
  useEffect(() => {
    if (!ready) {
      helperRef.current = null;
      return;
    }
    void refresh();
    const poll = setInterval(() => document.visibilityState === "visible" && void refresh(), 20_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [ready, refresh, locked]);

  const shown = ready ? status : null;
  const secondsLeft = shown?.operator ? Math.max(0, Number(shown.expiresAt) - Math.floor(now / 1000)) : 0;
  const live = !!shown && !!shown.operator && secondsLeft > 0 && shown.paymentsLeft > 0;

  // The switch mirrors the chain.
  useEffect(() => {
    if (!status || busy) return;
    if (settingsRef.current.enabled !== live) {
      if (settingsRef.current.enabled && !live) toast("Automatic payroll ended", { description: status.paymentsLeft === 0 ? "It used all of its payments." : "Its time ran out. Turn it on again for the next run." });
      onChange({ ...settingsRef.current, enabled: live });
    }
  }, [status, live, busy, onChange]);

  const turnOn = async () => {
    const k = keys.getKeys();
    if (!k) return void keys.requireKeys();
    if (!signer) return;
    setBusy("authorizing");
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      let what = { topUpLamports: 0n, authorize: true };
      await ensureHelperReady({
        rpc,
        admin: signer,
        helper: helperRef.current,
        terms: { ttlSeconds: settings.ttlSeconds, maxPayments: cap },
        needPayments: cap,
        force: true,
        onNeedApproval: (w) => {
          what = w;
        },
        onPrompt: ({ attempt, expiresAtMs }) =>
          setWallet({
            deadline: expiresAtMs,
            note: `${attempt > 0 ? "That took longer than devnet allows, so we're asking again. " : ""}Approve in your wallet${what.topUpLamports > 0n ? `: it sends ${sol(what.topUpLamports)} SOL to your payroll helper (for temporary proof-account rent, returned later)` : ""} and lets the helper make up to ${cap} payment${cap === 1 ? "" : "s"} for ${OPERATOR_TTL_OPTIONS.find((o) => o.seconds === settings.ttlSeconds)?.label ?? "a while"}. It can't do anything else.`,
          }),
        onSigned: () => setWallet(null),
      });
      await refresh();
      toast.success("Automatic payroll is on", { description: "Run payroll now: no wallet approvals are needed until the timer ends." });
    } catch (e) {
      toast.error("Couldn't turn on automatic payroll", { description: e instanceof Error ? e.message : "The approval failed. Nothing changed." });
    } finally {
      setWallet(null);
      setBusy(null);
    }
  };

  const turnOff = async () => {
    const helper = helperRef.current;
    if (!signer || !helper) return;
    setBusy("revoking");
    try {
      const back = await revokeAndReclaim({
        rpc,
        admin: signer,
        helper,
        onPrompt: ({ expiresAtMs }) => setWallet({ deadline: expiresAtMs, note: "Approve the revoke in your wallet. It only ends the authorization." }),
        onSigned: () => setWallet(null),
      });
      toast.success("Automatic payroll is off", { description: back > 0n ? `${sol(back)} SOL returned from the payroll helper to your wallet.` : "The helper had no SOL to return." });
    } catch (e) {
      toast.error("Couldn't turn it off", { description: e instanceof Error ? e.message : "The approval failed. It is still on." });
    } finally {
      setWallet(null);
      setBusy(null);
      await refresh();
    }
  };

  const reclaim = async () => {
    const helper = helperRef.current;
    if (!signer || !helper) return;
    setBusy("revoking");
    try {
      const back = await sweepHelper({ rpc, admin: signer, helper });
      toast.success("SOL returned", { description: `${sol(back)} SOL moved from the payroll helper to your wallet.` });
    } catch (e) {
      toast.error("Couldn't return the SOL", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const onSwitch = (on: boolean) => (on ? void turnOn() : void turnOff());
  const editable = !live && !busy && !locked;
  const estimate = Math.max(1, recipients) * 30;
  const tooShort = !live && settings.ttlSeconds < estimate;

  return (
    <section className="plate enter p-5" aria-label="Automatic payroll" style={{ ["--i" as string]: 2 }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-sans text-sm font-semibold tracking-normal">Automatic payroll</h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            {live
              ? "On. Your payroll helper pays everyone with no wallet popups, until the timer or the payment limit runs out."
              : busy === "authorizing"
                ? "Waiting for your wallet. Approve it once and payroll can then run without more popups."
                : "Off: your wallet approves each payment, one by one. Turn it on to approve once, up front, and then run payroll hands-free."}
          </p>
        </div>
        <Switch checked={live || busy === "authorizing"} onCheckedChange={onSwitch} disabled={locked || !!busy} aria-label="Automatic payroll" />
      </div>

      <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Stays on for</p>
          <Segmented
            label="How long automatic payroll stays on"
            value={String(settings.ttlSeconds)}
            onChange={(v) => editable && onChange({ ...settings, ttlSeconds: Number(v) })}
            options={OPERATOR_TTL_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))}
            className={cn(!editable && "pointer-events-none opacity-60")}
          />
          {tooShort ? <p className="mt-1 text-xs text-pending">A run of {recipients} can take about {Math.ceil(estimate / 60)} min (roughly 30 s per person on devnet). Pick a longer time or it may run out mid-run.</p> : null}
        </div>
        <div>
          <label htmlFor="max-payments" className="mb-1.5 block text-xs font-medium text-muted-foreground">Most payments it may make</label>
          <input
            id="max-payments"
            type="number"
            min={recipients}
            max={500}
            value={live && shown ? shown.paymentsLeft : cap}
            disabled={!editable}
            onChange={(e) => onChange({ ...settings, maxPayments: Math.max(recipients, Math.min(500, Math.floor(Number(e.target.value) || recipients))) })}
            className="h-9 w-28 rounded-lg border bg-background px-3 font-mono text-sm tnum disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted-foreground">{live ? "Payments left." : `At least ${recipients}, the people in this run.`} It can&apos;t limit the amount, because amounts are encrypted.</p>
        </div>
      </div>

      {live && shown ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-verified/30 bg-verified-soft px-3 py-2.5 text-[13px]" role="status">
          <div>
            <p className="font-medium">
              Time left <span className={cn("font-mono tnum", secondsLeft <= 10 && "text-pending")}>{mmss(secondsLeft)}</span>
              <span className="text-muted-foreground"> · {shown.paymentsLeft} payment{shown.paymentsLeft === 1 ? "" : "s"} left</span>
            </p>
            <p className="text-xs text-muted-foreground">Payroll helper holds {balance === null ? "…" : `${sol(balance)} SOL`}. Turn the switch off to revoke it and get that SOL back.</p>
          </div>
        </div>
      ) : !live && balance !== null && balance > 10_000n ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-[13px]">
          <p className="text-xs text-muted-foreground">Payroll helper still holds {sol(balance)} SOL from earlier.</p>
          <Button size="sm" variant="outline" onClick={reclaim} disabled={!!busy || locked}>Reclaim SOL</Button>
        </div>
      ) : null}
      {wallet ? <div className="mt-2"><WalletCountdown deadline={wallet.deadline} note={wallet.note} /></div> : null}
      {!ready ? <p className="mt-3 text-xs text-muted-foreground">Unlock your keys to turn this on or see its status.</p> : null}
    </section>
  );
}
