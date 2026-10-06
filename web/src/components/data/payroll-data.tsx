"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSignMessage } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { useWallet } from "@/components/wallet/wallet-context";
import type { Employee, Run } from "@/lib/mock/data";

/**
 * The company's payroll list and run history. Real wallets read and write them through the API (D1); demo wallets keep using the
 * in-memory mock store, so this reports "demo" and the pages read the store instead.
 *
 * "needs-auth" means this wallet has not signed in yet. One free wallet signature starts a session, which is what proves to the
 * server that the caller owns the wallet before it hands over (or accepts) a salary list.
 */
export type PayrollDataStatus = "demo" | "needs-auth" | "loading" | "ready" | "error";

export interface NewEmployee {
  name: string;
  role?: string;
  wallet: string;
  /** Base units. */
  salary: bigint;
}

export interface RunItemInput {
  wallet: string;
  name: string;
  amount: bigint;
  signature: string | null;
  status: "confirmed" | "failed";
  error?: string | null;
}

interface PayrollData {
  status: PayrollDataStatus;
  employees: Employee[];
  runs: Run[];
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<void>;
  refresh: () => Promise<void>;
  addEmployee: (e: NewEmployee) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  recordRun: (label: string, items: RunItemInput[]) => Promise<void>;
}

const Ctx = createContext<PayrollData | null>(null);

interface ApiEmployee { id: string; name: string; role: string; wallet: string; salary: string }
interface ApiRun { id: string; label: string; createdAt: string; status: string; recipients: number; total: string; items: { wallet: string; name: string; amount: string; signature: string; status: string }[] }

const toEmployee = (e: ApiEmployee): Employee => ({ id: e.id, name: e.name, role: e.role, wallet: e.wallet, salary: BigInt(e.salary) });
const toRun = (r: ApiRun): Run => ({
  id: r.id,
  label: r.label,
  date: new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
  status: r.status === "done" ? "done" : "failed",
  recipients: r.recipients,
  total: BigInt(r.total),
  items: r.items.map((i) => ({ wallet: i.wallet, name: i.name, amount: BigInt(i.amount), signature: i.signature })),
});

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
  runs: [],
  error: null,
  signingIn: false,
  signIn: async () => {},
  refresh: async () => {},
  addEmployee: async () => {},
  removeEmployee: async () => {},
  recordRun: async () => {},
};

type Loaded = { for: string; status: "needs-auth" | "ready" | "error"; employees: Employee[]; runs: Run[]; error: string | null };

function LiveProvider({ account, children }: { account: UiWalletAccount; children: React.ReactNode }) {
  const address = account.address;
  const signMessage = useSignMessage(account);
  const [state, setState] = useState<Loaded | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await api<{ address: string }>("/api/auth/session");
      // A cookie from a different wallet is not this wallet's session.
      if (session.address !== address) throw new ApiError("Signed in as another wallet", 401);
      const data = await api<{ employees: ApiEmployee[]; runs: ApiRun[] }>("/api/company");
      setState({ for: address, status: "ready", employees: data.employees.map(toEmployee), runs: data.runs.map(toRun), error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ for: address, status: "needs-auth", employees: [], runs: [], error: null });
      else setState({ for: address, status: "error", employees: [], runs: [], error: e instanceof Error ? e.message : "Could not load your payroll data." });
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
      setState({ for: address, status: "needs-auth", employees: [], runs: [], error: /reject|declin|denied|cancel|closed|user/i.test(msg) ? "You declined the sign-in request." : msg });
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
        if (e instanceof ApiError && e.status === 401) setState({ for: address, status: "needs-auth", employees: [], runs: [], error: "Your session expired. Sign in again." });
        throw e;
      }
    },
    [address],
  );

  const addEmployee = useCallback(
    async (e: NewEmployee) => {
      const created = await guard(() => api<ApiEmployee>("/api/employees", { method: "POST", body: JSON.stringify({ name: e.name, role: e.role, wallet: e.wallet, amount: e.salary.toString() }) }));
      setState((s) => (s && s.for === address ? { ...s, employees: [toEmployee(created), ...s.employees] } : s));
    },
    [guard, address],
  );

  const removeEmployee = useCallback(
    async (id: string) => {
      await guard(() => api(`/api/employees/${id}`, { method: "DELETE" }));
      setState((s) => (s && s.for === address ? { ...s, employees: s.employees.filter((x) => x.id !== id) } : s));
    },
    [guard, address],
  );

  const recordRun = useCallback(
    async (label: string, items: RunItemInput[]) => {
      await guard(() => api("/api/runs", { method: "POST", body: JSON.stringify({ label, items: items.map((i) => ({ ...i, amount: i.amount.toString() })) }) }));
      await load();
    },
    [guard, load],
  );

  const value = useMemo<PayrollData>(() => {
    const mine = state && state.for === address ? state : null;
    return {
      status: mine ? mine.status : "loading",
      employees: mine?.employees ?? [],
      runs: mine?.runs ?? [],
      error: mine?.error ?? null,
      signingIn,
      signIn,
      refresh: load,
      addEmployee,
      removeEmployee,
      recordRun,
    };
  }, [state, address, signingIn, signIn, load, addEmployee, removeEmployee, recordRun]);

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
