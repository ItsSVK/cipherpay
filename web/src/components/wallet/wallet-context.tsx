"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type WalletStatus = "loading" | "disconnected" | "connecting" | "connected";

interface WalletState {
  status: WalletStatus;
  address: string | null;
  /** The address being connected while status is "connecting". */
  connectingTo: string | null;
  connect: (address: string) => void;
  disconnect: () => void;
}

const STORAGE_KEY = "cipherpay:demo-wallet";
const Ctx = createContext<WalletState | null>(null);

// Only the public address is remembered, so a refresh does not bounce you out. Keys are never stored.
const read = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const write = (address: string | null) => {
  try {
    if (address) window.sessionStorage.setItem(STORAGE_KEY, address);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the session just will not survive a refresh */
  }
};

/**
 * MOCK wallet connection. The shape (status, address, connect, disconnect) is what a wallet-standard
 * provider will expose, so pages and the shell do not change when the real one is swapped in.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [address, setAddress] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = read();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from sessionStorage
    if (saved) { setAddress(saved); setStatus("connected"); } else setStatus("disconnected");
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const connect = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setConnectingTo(next);
    setStatus("connecting");
    timer.current = setTimeout(() => {
      write(next);
      setAddress(next);
      setConnectingTo(null);
      setStatus("connected");
    }, 800);
  }, []);

  const disconnect = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    write(null);
    setAddress(null);
    setConnectingTo(null);
    setStatus("disconnected");
  }, []);

  const value = useMemo(() => ({ status, address, connectingTo, connect, disconnect }), [status, address, connectingTo, connect, disconnect]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
