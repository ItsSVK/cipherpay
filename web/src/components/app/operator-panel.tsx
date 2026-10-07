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
import { authorizeHelper, deriveHelperSigner, helperBalance, revokeAndReclaim, sweepHelper, topUpHelperIfShort } from "@/lib/chain/helper-signer";
import { OPERATOR_TTL_OPTIONS, readOperator, type OperatorStatus } from "@/lib/chain/operator";
import { rpc } from "@/lib/chain/rpc";
import { walletPromptOpen } from "@/lib/chain/send";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/info-tooltip";

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
  const { signer, signMessage } = useTxSigner();
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<null | "authorizing" | "revoking">(null);
  // `deadline` is set only for the SOL top-up, the one thing here the wallet signs as a (time-limited) transaction. The
  // authorization itself is a signed message, which never expires, so it shows a note with no countdown.
  const [wallet, setWallet] = useState<{ deadline?: number; note: string } | null>(null);
  const helperRef = useRef<Awaited<ReturnType<typeof deriveHelperSigner>> | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const ready = keys.ready && !!signer && !!signMessage;
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
    const poll = setInterval(() => document.visibilityState === "visible" && !walletPromptOpen() && void refresh(), 20_000);
    return () => clearInterval(poll);
  }, [ready, refresh, locked]);

  // The countdown's 1 s clock runs only while something is actually counting down.
  const counting = !!status?.operator && status.paymentsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [counting]);

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
    if (!signer || !signMessage) return;
    setBusy("authorizing");
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      const helper = helperRef.current;

      // 1. The helper pays for its own transactions, including the authorization below. This is the only step the wallet signs
      //    as a transaction, so it is the only one with a deadline, and it only happens when the helper is actually low.
      let topUp = 0n;
      await topUpHelperIfShort({
        rpc,
        admin: signer,
        helper,
        onNeedTopUp: (lamports) => {
          topUp = lamports;
        },
        onPrompt: ({ attempt, expiresAtMs }) =>
          setWallet({
            deadline: expiresAtMs,
            note: `${attempt > 0 ? "That took longer than devnet allows, so we're asking again. " : ""}First, your wallet will show a plain SOL transfer of ${sol(topUp)} SOL to your payroll helper. It pays the rent for the temporary proof accounts, and comes back when they close.`,
          }),
        onSigned: () => setWallet(null),
      });

      // 2. The authorization itself: the admin signs a short message, NOT a transaction. It has no expiry and nothing for the
      //    wallet to simulate, so a slow popup cannot invalidate it. The helper then submits and pays for it.
      setWallet({ note: `Approve the authorization in your wallet. It is a plain message, not a transaction, so there is no time limit: take as long as you need. It lets your payroll helper make up to ${cap} payment${cap === 1 ? "" : "s"} for ${OPERATOR_TTL_OPTIONS.find((o) => o.seconds === settings.ttlSeconds)?.label ?? "a while"}, and nothing else.` });
      await authorizeHelper({ rpc, admin: address(signer.address), helper, signMessage, terms: { ttlSeconds: settings.ttlSeconds, maxPayments: cap } });

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
    if (!signer || !signMessage || !helper) return;
    setBusy("revoking");
    try {
      // Also a signed message, so turning it off has no deadline either.
      setWallet({ note: "Approve the revoke in your wallet. It is a plain message with no time limit, and it only ends the authorization." });
      const back = await revokeAndReclaim({ rpc, admin: signer, helper, signMessage });
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
    <section className="plate enter p-5 sm:p-6" aria-label="Automatic payroll" style={{ ["--i" as string]: 2 }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Automatic Payroll Helper</h2>
            <InfoTooltip content="Approve once up-front to allow your local helper key to sign the 6-7 transactions per employee automatically without manual wallet popups for each transfer." />
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            {live
              ? "Active: Your payroll helper signs each transfer automatically without wallet prompts until the time limit expires."
              : busy === "authorizing"
                ? "Awaiting single wallet approval to activate hands-free helper mode…"
                : "Approve once up front to execute the entire batch hands-free without individual transaction popups."}
          </p>
        </div>
        <Switch checked={live || busy === "authorizing"} onCheckedChange={onSwitch} disabled={locked || !!busy} aria-label="Automatic payroll switch" />
      </div>

      <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Authorization Duration</p>
          <Segmented
            label="Helper active duration"
            value={String(settings.ttlSeconds)}
            onChange={(v) => editable && onChange({ ...settings, ttlSeconds: Number(v) })}
            options={OPERATOR_TTL_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))}
            className={cn(!editable && "pointer-events-none opacity-60")}
          />
          {tooShort ? <p className="mt-1 text-xs text-pending">A run of {recipients} can take ~{Math.ceil(estimate / 60)} min. Consider a longer window.</p> : null}
        </div>
        <div>
          <label htmlFor="max-payments" className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Cap Limit</label>
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
          <p className="mt-1 text-xs text-muted-foreground">{live ? "Payments remaining." : `Minimum ${recipients} (recipients in batch).`}</p>
        </div>
      </div>

      {live && shown ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-verified/30 bg-verified-soft/50 p-3 text-xs" role="status">
          <div>
            <p className="font-medium text-foreground">
              Helper active: <span className={cn("font-mono font-semibold tnum", secondsLeft <= 10 && "text-pending")}>{mmss(secondsLeft)}</span>
              <span className="text-muted-foreground"> · {shown.paymentsLeft} payments remaining</span>
            </p>
            <p className="text-[11px] text-muted-foreground">Helper holds {balance === null ? "…" : `${sol(balance)} SOL`} for rent. Toggle off anytime to reclaim SOL.</p>
          </div>
        </div>
      ) : !live && balance !== null && balance > 10_000n ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 text-xs">
          <p className="text-muted-foreground">Helper key has {sol(balance)} SOL from previous authorization.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reclaim} disabled={!!busy || locked}>Reclaim SOL</Button>
        </div>
      ) : null}
      {wallet ? <div className="mt-2">{wallet.deadline ? <WalletCountdown deadline={wallet.deadline} note={wallet.note} /> : <p className="enter-fade text-xs font-medium text-primary" role="status">{wallet.note}</p>}</div> : null}
      {!ready ? <p className="mt-3 text-xs text-muted-foreground">Unlock keys to enable automatic helper authorization.</p> : null}
    </section>
  );
}
