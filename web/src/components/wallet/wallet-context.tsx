"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SelectedWalletAccountContextProvider, useSelectedWalletAccount } from "@solana/react";
import { uiWalletAccountBelongsToUiWallet, useDisconnect, type UiWallet, type UiWalletAccount } from "@wallet-standard/react";
import { SOLANA_CHAIN } from "@/lib/chain/constants";
import { walletLabel } from "@/lib/mock/wallets";

export type WalletStatus = "loading" | "disconnected" | "connecting" | "connected";

interface WalletState {
  status: WalletStatus;
  address: string | null;
  /** Display name: the wallet app's name (Phantom, ...) or the demo wallet's label. */
  walletName: string | null;
  /** The real wallet-standard account, or null for a demo wallet. Signing goes through this. */
  account: UiWalletAccount | null;
  isDemo: boolean;
  /** Solana wallets detected in this browser that support devnet. */
  wallets: readonly UiWallet[];
  /** Call after `useConnect(wallet)` resolves with the authorized accounts. */
  selectAccount: (account: UiWalletAccount) => void;
  /** MOCK: act as a sample-data wallet. Goes away once the mock store is replaced by chain reads. */
  connectDemo: (address: string) => void;
  /** The demo address being connected while status is "connecting". */
  connectingTo: string | null;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

const SELECTED_KEY = "cipherpay:wallet-account";
const DEMO_KEY = "cipherpay:demo-wallet";

// Only the wallet name and public address are remembered so a refresh does not bounce you out.
// Keys and signatures are never stored (see CLAUDE.md, hard rules).
const stateSync = {
  getSelectedWallet: () => { try { return window.localStorage.getItem(SELECTED_KEY); } catch { return null; } },
  storeSelectedWallet: (key: string) => { try { window.localStorage.setItem(SELECTED_KEY, key); } catch { /* storage unavailable */ } },
  deleteSelectedWallet: () => { try { window.localStorage.removeItem(SELECTED_KEY); } catch { /* storage unavailable */ } },
};

// Module scope on purpose: the provider memoises on this function's identity.
const filterWallets = (wallet: UiWallet) => wallet.chains.includes(SOLANA_CHAIN) && wallet.features.includes("standard:connect");

const readDemo = () => { try { return window.sessionStorage.getItem(DEMO_KEY); } catch { return null; } };
const writeDemo = (address: string | null) => {
  try {
    if (address) window.sessionStorage.setItem(DEMO_KEY, address);
    else window.sessionStorage.removeItem(DEMO_KEY);
  } catch { /* storage unavailable */ }
};

/** Renders nothing; exposes the connected wallet's standard:disconnect to the provider. */
function DisconnectRegistrar({ wallet, register }: { wallet: UiWallet; register: (fn: (() => Promise<void>) | null) => void }) {
  const [, disconnect] = useDisconnect(wallet);
  useEffect(() => {
    register(() => disconnect());
    return () => register(null);
  }, [disconnect, register]);
  return null;
}

function Inner({ children }: { children: React.ReactNode }) {
  const [selected, setSelected, wallets] = useSelectedWalletAccount();
  const [demo, setDemo] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectRef = useRef<(() => Promise<void>) | null>(null);
  const register = useCallback((fn: (() => Promise<void>) | null) => { disconnectRef.current = fn; }, []);

  useEffect(() => {
    // One-time hydration from storage. If a real wallet was saved, give it a moment to register before showing the connect screen.
    const savedDemo = readDemo();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (savedDemo) setDemo(savedDemo);
    else if (stateSync.getSelectedWallet()) setRestoring(true);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => setRestoring(false), 1500);
    return () => { clearTimeout(t); if (demoTimer.current) clearTimeout(demoTimer.current); };
  }, []);

  const connectDemo = useCallback((address: string) => {
    if (demoTimer.current) clearTimeout(demoTimer.current);
    setConnectingTo(address);
    demoTimer.current = setTimeout(() => {
      writeDemo(address);
      setDemo(address);
      setConnectingTo(null);
    }, 700);
  }, []);

  const walletOfSelected = useMemo(() => (selected ? wallets.find((w) => uiWalletAccountBelongsToUiWallet(selected, w)) : undefined), [selected, wallets]);

  const disconnect = useCallback(async () => {
    if (demo) {
      writeDemo(null);
      setDemo(null);
      return;
    }
    // Capture the wallet's own disconnect first: dropping the selection unmounts the registrar that provides it.
    const walletDisconnect = disconnectRef.current;
    // Forget the wallet and drop the selection right away. We delete the saved key ourselves instead of relying on the
    // library, which skips the delete when it has already cleared the selection after the wallet reported no accounts.
    // Otherwise a wallet that stays authorized for this site is restored on the next refresh and logout looks broken.
    stateSync.deleteSelectedWallet();
    setSelected(undefined);
    try {
      // Ask the wallet to deauthorize too, but never let a slow or missing disconnect hold up logging out.
      await Promise.race([walletDisconnect?.(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    } catch {
      /* the wallet may not support disconnect; we have already dropped our own selection */
    }
  }, [demo, setSelected]);

  const value = useMemo<WalletState>(() => {
    const base = { wallets, selectAccount: setSelected as (a: UiWalletAccount) => void, connectDemo, connectingTo, disconnect };
    if (demo) return { ...base, status: "connected", address: demo, walletName: walletLabel(demo) ?? "Demo wallet", account: null, isDemo: true };
    if (selected) return { ...base, status: "connected", address: selected.address, walletName: walletOfSelected?.name ?? "Wallet", account: selected, isDemo: false };
    const status: WalletStatus = !hydrated || restoring ? "loading" : connectingTo ? "connecting" : "disconnected";
    return { ...base, status, address: null, walletName: null, account: null, isDemo: false };
  }, [demo, selected, walletOfSelected, wallets, hydrated, restoring, connectingTo, connectDemo, disconnect, setSelected]);

  return (
    <Ctx.Provider value={value}>
      {walletOfSelected && walletOfSelected.features.includes("standard:disconnect") ? <DisconnectRegistrar key={walletOfSelected.name} wallet={walletOfSelected} register={register} /> : null}
      {children}
    </Ctx.Provider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <SelectedWalletAccountContextProvider filterWallets={filterWallets} stateSync={stateSync}>
      <Inner>{children}</Inner>
    </SelectedWalletAccountContextProvider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
