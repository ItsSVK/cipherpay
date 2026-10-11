"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { address, type Address } from "@solana/kit";
import { usePayrollData } from "@/components/data/payroll-data";
import { useWallet } from "@/components/wallet/wallet-context";
import { rpc } from "@/lib/chain/rpc";
import { onWalletPromptChange, walletPromptOpen } from "@/lib/chain/send";
import { readChainState, type VaultChainState, type WalletChainState } from "@/lib/chain/read";

type ChainStatus = "idle" | "loading" | "ready" | "error";

interface ChainState {
  /** "idle" while no wallet is connected. */
  status: ChainStatus;
  /** True until the first read finishes (and again for a different wallet). */
  loading: boolean;
  wallet: WalletChainState | null;
  vault: VaultChainState | null;
  /** Which payroll-list wallets can already receive confidential pay. */
  activation: Record<string, boolean>;
  error: string | null;
  updatedAt: number | null;
  refresh: () => void;
}

const Ctx = createContext<ChainState | null>(null);
const POLL_MS = 30_000;

/**
 * Reads the connected real wallet's devnet state (SOL, WUSDC account, vault) and the activation of everyone
 * on its payroll list, then keeps it fresh. Read-only.
 */
export function ChainProvider({ children }: { children: React.ReactNode }) {
  const { address: connected } = useWallet();
  const payroll = usePayrollData();
  const [data, setData] = useState<{ for: string; wallet: WalletChainState; vault: VaultChainState; activation: Record<string, boolean>; at: number } | null>(null);
  const [error, setError] = useState<{ for: string; message: string } | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  // Employee wallets to check. A stable key keeps polling from restarting on unrelated data changes.
  const employeeKey = payroll.employees.map((e) => e.wallet).join("|");

  useEffect(() => {
    if (!connected) return;
    const mine = ++seq.current;
    const owner = address(connected);
    const wallets = employeeKey ? employeeKey.split("|").map((w) => address(w)) : [];
    let cancelled = false;
    (async () => {
      try {
        const { wallet, vault, activation } = await readChainState(rpc, owner, wallets as Address[]);
        if (cancelled || mine !== seq.current) return;
        setData({ for: connected, wallet, vault, activation, at: Date.now() });
        setError(null);
      } catch (e) {
        if (cancelled || mine !== seq.current) return;
        setError({ for: connected, message: e instanceof Error ? e.message : "Could not read devnet." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, employeeKey, tick]);

  useEffect(() => {
    if (!connected) return;
    // A wallet popup does not hide the page, so without this the poll (1-2 RPC calls, and a main-thread decrypt whenever a
    // ciphertext changed) keeps firing exactly while the wallet is trying to open. Stand down, then catch up once it closes.
    let missed = false;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (walletPromptOpen()) {
        missed = true;
        return;
      }
      setTick((n) => n + 1);
    }, POLL_MS);
    const off = onWalletPromptChange((open) => {
      if (!open && missed) {
        missed = false;
        setTick((n) => n + 1);
      }
    });
    return () => {
      clearInterval(id);
      off();
    };
  }, [connected]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const value = useMemo<ChainState>(() => {
    if (!connected) return { status: "idle", loading: false, wallet: null, vault: null, activation: {}, error: null, updatedAt: null, refresh };
    const mine = data && data.for === connected ? data : null;
    const err = error && error.for === connected ? error.message : null;
    return {
      status: mine ? (err ? "error" : "ready") : err ? "error" : "loading",
      loading: !mine && !err,
      wallet: mine?.wallet ?? null,
      vault: mine?.vault ?? null,
      activation: mine?.activation ?? {},
      error: err,
      updatedAt: mine?.at ?? null,
      refresh,
    };
  }, [connected, data, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChain(): ChainState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChain must be used inside <ChainProvider>");
  return ctx;
}
