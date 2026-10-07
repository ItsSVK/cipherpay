"use client";

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { useTxSigner } from "@/components/chain/tx-signer";
import { useKeys } from "@/components/crypto/key-context";
import {
  authorizeHelper,
  deriveHelperSigner,
  helperBalance,
  revokeAndReclaim,
  sweepHelper,
  topUpHelperIfShort,
} from "@/lib/chain/helper-signer";
import { OPERATOR_TTL_OPTIONS, readOperator, type OperatorStatus } from "@/lib/chain/operator";
import { rpc } from "@/lib/chain/rpc";
import { walletPromptOpen } from "@/lib/chain/send";
import type { RunSettings } from "@/lib/payroll/use-live-run";

export interface AutoPayrollSettings {
  enabled: boolean;
  ttlSeconds: number;
  maxPayments: number | null;
}

export const DEFAULT_AUTO_SETTINGS: AutoPayrollSettings = { enabled: false, ttlSeconds: 5 * 60, maxPayments: null };

export const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(4);
export const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

interface OperatorContextValue {
  settings: AutoPayrollSettings;
  auto: AutoPayrollSettings;
  setSettings: (next: AutoPayrollSettings) => void;
  status: OperatorStatus | null;
  balance: bigint | null;
  now: number;
  secondsLeft: number;
  live: boolean;
  busy: null | "authorizing" | "revoking";
  wallet: { deadline?: number; note: string } | null;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
  onSwitch: (on: boolean) => void;
  reclaim: () => Promise<void>;
  refresh: () => Promise<void>;
  runSettings: RunSettings;
  ready: boolean;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const keys = useKeys();
  const { signer, signMessage } = useTxSigner();
  const [settings, setSettings] = useState<AutoPayrollSettings>(DEFAULT_AUTO_SETTINGS);
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<null | "authorizing" | "revoking">(null);
  const [wallet, setWallet] = useState<{ deadline?: number; note: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const helperRef = useRef<Awaited<ReturnType<typeof deriveHelperSigner>> | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  });

  const ready = keys.ready && !!signer && !!signMessage;
  const cap = settings.maxPayments ?? 10;

  const refresh = useCallback(async () => {
    const k = keys.getKeys();
    if (!k || !signer) return;
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      const helper = helperRef.current;
      const [op, bal] = await Promise.all([
        readOperator(rpc, address(signer.address), helper.address, 1, BigInt(Math.floor(Date.now() / 1000))),
        helperBalance(rpc, helper),
      ]);
      setStatus(op);
      setBalance(bal);
    } catch {
      // Keep last known status
    }
  }, [keys, signer]);

  useEffect(() => {
    if (!ready) {
      helperRef.current = null;
      return;
    }
    void refresh();
    const poll = setInterval(() => document.visibilityState === "visible" && !walletPromptOpen() && void refresh(), 20_000);
    return () => clearInterval(poll);
  }, [ready, refresh]);

  const counting = !!status?.operator && status.paymentsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [counting]);

  const shown = ready ? status : null;
  const secondsLeft = shown?.operator ? Math.max(0, Number(shown.expiresAt) - Math.floor(now / 1000)) : 0;
  const live = !!shown && !!shown.operator && secondsLeft > 0 && shown.paymentsLeft > 0;

  useEffect(() => {
    if (!status || busy) return;
    if (settingsRef.current.enabled !== live) {
      if (settingsRef.current.enabled && !live) {
        toast("Automatic payroll ended", {
          description: status.paymentsLeft === 0 ? "It used all of its authorized payments." : "Its time ran out. Turn it on again for the next run.",
        });
      }
      setSettings((prev) => ({ ...prev, enabled: live }));
    }
  }, [status, live, busy]);

  const turnOn = async () => {
    const k = keys.getKeys();
    if (!k) return void keys.requireKeys();
    if (!signer || !signMessage) return;
    setBusy("authorizing");
    try {
      helperRef.current ??= await deriveHelperSigner(k);
      const helper = helperRef.current;

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
            note: `${attempt > 0 ? "That took longer than devnet allows, so we're asking again. " : ""}Your wallet will show a SOL transfer of ${sol(topUp)} SOL to your payroll helper.`,
          }),
        onSigned: () => setWallet(null),
      });

      setWallet({
        note: `Approve the authorization in your wallet. It lets your payroll helper make up to ${cap} payment${cap === 1 ? "" : "s"} for ${OPERATOR_TTL_OPTIONS.find((o) => o.seconds === settings.ttlSeconds)?.label ?? "a while"}.`,
      });
      await authorizeHelper({
        rpc,
        admin: address(signer.address),
        helper,
        signMessage,
        terms: { ttlSeconds: settings.ttlSeconds, maxPayments: cap },
      });

      await refresh();
      toast.success("Automatic payroll helper active", {
        description: "Payroll can now execute without repeated wallet approvals until the timer ends.",
      });
    } catch (e) {
      toast.error("Couldn't activate helper", { description: e instanceof Error ? e.message : "Approval failed." });
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
      setWallet({ note: "Approve the revoke in your wallet to end helper authorization." });
      const back = await revokeAndReclaim({ rpc, admin: signer, helper, signMessage });
      toast.success("Automatic payroll disabled", {
        description: back > 0n ? `${sol(back)} SOL returned from helper to your wallet.` : "Helper had no remaining SOL to return.",
      });
    } catch (e) {
      toast.error("Couldn't disable helper", { description: e instanceof Error ? e.message : "Revoke failed." });
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
      toast.success("SOL returned", { description: `${sol(back)} SOL moved from helper to your wallet.` });
    } catch (e) {
      toast.error("Couldn't reclaim SOL", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const onSwitch = (on: boolean) => (on ? void turnOn() : void turnOff());

  const runSettings: RunSettings = useMemo(() => {
    if (live) {
      return {
        mode: "automatic",
        terms: {
          ttlSeconds: settings.ttlSeconds,
          maxPayments: cap,
        },
      };
    }
    return { mode: "manual" };
  }, [live, settings.ttlSeconds, cap]);

  const value = {
    settings,
    auto: settings,
    setSettings,
    status,
    balance,
    now,
    secondsLeft,
    live,
    busy,
    wallet,
    modalOpen,
    setModalOpen,
    turnOn,
    turnOff,
    onSwitch,
    reclaim,
    refresh,
    runSettings,
    ready,
  };

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) {
    throw new Error("useOperator must be used within an OperatorProvider");
  }
  return ctx;
}
