"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSignMessage } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { useWallet } from "@/components/wallet/wallet-context";
import type { Employee } from "@/lib/mock/data";

/**
 * The company's saved addresses and run history. Real wallets read and write them through the API (D1); demo wallets keep using the
 * in-memory mock store, so this reports "demo" and the pages read the store instead.
 *
 * Amounts arrive SEALED (encrypted by the admin's browser, see lib/crypto/record-seal.ts). This provider sits outside the key
 * provider and never opens them; `useOpenRecords` (inside it) does, while the keys are unlocked.
 *
 * "needs-auth" means this wallet has not signed in yet. One free wallet signature starts a session, which is what proves to the
 * server that the caller owns the wallet before it hands over (or accepts) your saved addresses.
 */
export type PayrollDataStatus = "demo" | "needs-auth" | "loading" | "ready" | "error";

/** A saved address: who the employer pays, no amount (amounts are entered per run). */
export interface NewAddress {
  name: string;
  wallet: string;
}

/** A new payroll, already sealed: the id is chosen by the browser because each sealed amount is bound to it. */
export interface NewSealedPayroll {
  id: string;
  name: string;
  entries: { addressId: string; amountCt: string }[];
}

/** A saved payroll as stored. `legacyAmount` is the plaintext of an entry saved before sealing existed (null once sealed). */
export interface SealedPayroll {
  id: string;
  name: string;
  entries: { addressId: string; name: string; wallet: string; amountCt: string | null; legacyAmount: string | null }[];
}

export interface SealedRun {
  id: string;
  label: string;
  payrollId: string | null;
  createdAt: string;
  status: string;
  recipients: number;
  totalCt: string | null;
  legacyTotal: string | null;
  items: { id: number; wallet: string; name: string; amountCt: string | null; legacyAmount: string | null; signature: string; status: string }[];
}

/** One confirmed payment the employer's record says was sent to this wallet. No amount (it is sealed for the employer); the signature lets anyone check it on-chain. */
export interface ReceivedPayment {
  id: string;
  employer: string;
  label: string;
  createdAt: string;
  signature: string;
}

export interface NewSealedRun {
  id: string;
  label: string;
  payrollId: string | null;
  totalCt: string;
  items: { wallet: string; name: string; amountCt: string; signature: string | null; status: "confirmed" | "failed"; error?: string | null }[];
}

/** Ciphertexts for rows saved before sealing existed (see POST /api/seal). */
export interface LegacySeal {
  entries: { payrollId: string; addressId: string; amountCt: string }[];
  runs: { id: string; totalCt: string }[];
  items: { id: number; amountCt: string }[];
}

interface PayrollData {
  status: PayrollDataStatus;
  /** Saved addresses, as payroll recipients with no amount yet (`salary` is 0 until the run page asks for one). */
  employees: Employee[];
  payrolls: SealedPayroll[];
  runs: SealedRun[];
  /** Payments addressed to the connected wallet, newest first. Empty until signed in. */
  payments: ReceivedPayment[];
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<void>;
  refresh: () => Promise<void>;
  addAddress: (a: NewAddress) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  addPayroll: (p: NewSealedPayroll) => Promise<SealedPayroll>;
  removePayroll: (id: string) => Promise<void>;
  recordRun: (run: NewSealedRun) => Promise<void>;
  /** Seals rows saved before sealing existed. Runs at most once per load, however many views ask. */
  sealLegacy: (seal: LegacySeal) => Promise<void>;
}

const Ctx = createContext<PayrollData | null>(null);

interface ApiAddress { id: string; name: string; wallet: string }

const toEmployee = (a: ApiAddress): Employee => ({ id: a.id, name: a.name, role: "", wallet: a.wallet, salary: 0n });

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body;
}

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const DEMO: PayrollData = {
  status: "demo",
  employees: [],
  payrolls: [],
  runs: [],
  payments: [],
  error: null,
  signingIn: false,
  signIn: async () => {},
  refresh: async () => {},
  addAddress: async () => {},
  removeAddress: async () => {},
  addPayroll: async () => {
    throw new Error("Demo wallets use the in-memory list.");
  },
  removePayroll: async () => {},
  recordRun: async () => {},
  sealLegacy: async () => {},
};

type Loaded = { for: string; status: "needs-auth" | "ready" | "error"; employees: Employee[]; payrolls: SealedPayroll[]; runs: SealedRun[]; payments: ReceivedPayment[]; error: string | null };

function LiveProvider({ account, children }: { account: UiWalletAccount; children: React.ReactNode }) {
  const address = account.address;
  const signMessage = useSignMessage(account);
  const [state, setState] = useState<Loaded | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const sealing = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await api<{ address: string }>("/api/auth/session");
      // A cookie from a different wallet is not this wallet's session.
      if (session.address !== address) throw new ApiError("Signed in as another wallet", 401);
      const [data, received] = await Promise.all([api<{ addresses: ApiAddress[]; payrolls: SealedPayroll[]; runs: SealedRun[] }>("/api/company"), api<{ payments: ReceivedPayment[] }>("/api/payments")]);
      setState({ for: address, status: "ready", employees: data.addresses.map(toEmployee), payrolls: data.payrolls, runs: data.runs, payments: received.payments, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ for: address, status: "needs-auth", employees: [], payrolls: [], runs: [], payments: [], error: null });
      else setState({ for: address, status: "error", employees: [], payrolls: [], runs: [], payments: [], error: e instanceof Error ? e.message : "Could not load your payroll data." });
    }
  }, [address]);

  useEffect(() => {
    // Initial fetch for this wallet. The state update happens after the awaited request, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address }) });
      const { signature } = await signMessage({ message: new TextEncoder().encode(message) });
      await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ address, nonce, signature: base64(signature) }) });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed.";
      setState({ for: address, status: "needs-auth", employees: [], payrolls: [], runs: [], payments: [], error: /reject|declin|denied|cancel|closed|user/i.test(msg) ? "You declined the sign-in request." : msg });
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessage, load]);

  // A request that finds the session gone sends the user back to sign in instead of failing silently.
  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setState({ for: address, status: "needs-auth", employees: [], payrolls: [], runs: [], payments: [], error: "Your session expired. Sign in again." });
        throw e;
      }
    },
    [address],
  );

  const addAddress = useCallback(
    async (a: NewAddress) => {
      const created = await guard(() => api<ApiAddress>("/api/addresses", { method: "POST", body: JSON.stringify({ name: a.name, wallet: a.wallet }) }));
      setState((s) => (s && s.for === address ? { ...s, employees: [toEmployee(created), ...s.employees] } : s));
    },
    [guard, address],
  );

  const removeAddress = useCallback(
    async (id: string) => {
      await guard(() => api(`/api/addresses/${id}`, { method: "DELETE" }));
      setState((s) => (s && s.for === address ? { ...s, employees: s.employees.filter((x) => x.id !== id) } : s));
    },
    [guard, address],
  );

  const addPayroll = useCallback(
    async (p: NewSealedPayroll) => {
      const created = await guard(() => api<SealedPayroll>("/api/payrolls", { method: "POST", body: JSON.stringify(p) }));
      setState((s) => (s && s.for === address ? { ...s, payrolls: [created, ...s.payrolls] } : s));
      return created;
    },
    [guard, address],
  );

  const removePayroll = useCallback(
    async (id: string) => {
      await guard(() => api(`/api/payrolls/${id}`, { method: "DELETE" }));
      setState((s) => (s && s.for === address ? { ...s, payrolls: s.payrolls.filter((x) => x.id !== id) } : s));
    },
    [guard, address],
  );

  const recordRun = useCallback(
    async (run: NewSealedRun) => {
      await guard(() => api("/api/runs", { method: "POST", body: JSON.stringify(run) }));
      await load();
    },
    [guard, load],
  );

  const sealLegacy = useCallback(
    (seal: LegacySeal) => {
      // Every view that opens records asks; only one request ever goes out. After it succeeds the reload has nothing left
      // to seal; if it fails, the next view to ask tries again.
      sealing.current ??= guard(() => api("/api/seal", { method: "POST", body: JSON.stringify(seal) })).then(load, (e) => {
        sealing.current = null;
        throw e;
      });
      return sealing.current;
    },
    [guard, load],
  );

  const value = useMemo<PayrollData>(() => {
    const mine = state && state.for === address ? state : null;
    return {
      status: mine ? mine.status : "loading",
      employees: mine?.employees ?? [],
      payrolls: mine?.payrolls ?? [],
      runs: mine?.runs ?? [],
      payments: mine?.payments ?? [],
      error: mine?.error ?? null,
      signingIn,
      signIn,
      refresh: load,
      addAddress,
      removeAddress,
      addPayroll,
      removePayroll,
      recordRun,
      sealLegacy,
    };
  }, [state, address, signingIn, signIn, load, addAddress, removeAddress, addPayroll, removePayroll, recordRun, sealLegacy]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PayrollDataProvider({ children }: { children: React.ReactNode }) {
  const { account } = useWallet();
  // Keyed by address so switching wallets drops the previous wallet's data immediately.
  return account ? (
    <LiveProvider key={account.address} account={account}>
      {children}
    </LiveProvider>
  ) : (
    <Ctx.Provider value={DEMO}>{children}</Ctx.Provider>
  );
}

export function usePayrollData(): PayrollData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePayrollData must be used inside <PayrollDataProvider>");
  return ctx;
}
