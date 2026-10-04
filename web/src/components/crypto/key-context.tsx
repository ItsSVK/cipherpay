"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type KeyStatus = "locked" | "deriving" | "ready";

/**
 * How keys are obtained. Admins and employees derive them from a wallet signature. The auditor key is
 * NOT wallet-derived (it is a standalone secret baked into the mint), so the auditor imports it instead.
 */
export type KeyMode = "signature" | "import";

export const KEY_COPY: Record<KeyMode, { stages: readonly [string, string, string]; descriptions: readonly [string, string, string] }> = {
  signature: {
    stages: ["Wallet signature", "ElGamal key", "AES key"],
    descriptions: [
      "Your wallet signs one fixed message. Nothing is sent anywhere.",
      "Derived from the signature, per owner and mint, inside this tab.",
      "Decrypts your own balance so the app can build your next transfer.",
    ],
  },
  import: {
    stages: ["Auditor secret", "ElGamal key", "Ready to decrypt"],
    descriptions: [
      "Read from what you pasted. It is not stored and is not sent anywhere.",
      "Rebuilt from the secret and checked against the mint's registered auditor key.",
      "Payment events can now be decrypted in this tab.",
    ],
  },
};
const STAGE_MS = [900, 1000, 750];

interface KeyState {
  mode: KeyMode;
  status: KeyStatus;
  /** Index of the stage currently running (0-2), or 3 when finished. */
  stage: number;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  /** Starts derivation. MOCK: the real app calls wallet signMessage and derives keys in memory. */
  unlock: () => void;
  /** Clears keys from memory. Also called on wallet disconnect or account change. */
  lock: () => void;
  ready: boolean;
  /** Increments every time keys are cleared, so views can drop anything decrypted under the old keys. */
  epoch: number;
  /** Ask for keys when the user hits something that needs them. */
  requireKeys: () => boolean;
}

const KeyContext = createContext<KeyState | null>(null);

export function KeyProvider({ children, mode = "signature" }: { children: React.ReactNode; mode?: KeyMode }) {
  const [status, setStatus] = useState<KeyStatus>("locked");
  const [stage, setStage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const unlock = useCallback(() => {
    if (status !== "locked") return;
    clear();
    setStatus("deriving");
    setStage(0);
    let at = 0;
    STAGE_MS.forEach((ms, i) => {
      at += ms;
      timers.current.push(
        setTimeout(() => {
          setStage(i + 1);
          if (i === STAGE_MS.length - 1) {
            setStatus("ready");
            timers.current.push(setTimeout(() => setDialogOpen(false), 850));
          }
        }, at),
      );
    });
  }, [status]);

  const lock = useCallback(() => {
    clear();
    setStatus("locked");
    setStage(0);
    setEpoch((n) => n + 1);
  }, []);

  const value = useMemo<KeyState>(
    () => ({
      mode,
      status,
      stage,
      dialogOpen,
      setDialogOpen,
      unlock,
      lock,
      ready: status === "ready",
      epoch,
      requireKeys: () => {
        if (status === "ready") return true;
        setDialogOpen(true);
        return false;
      },
    }),
    [mode, status, stage, dialogOpen, epoch, unlock, lock],
  );

  return <KeyContext.Provider value={value}>{children}</KeyContext.Provider>;
}

export function useKeys(): KeyState {
  const ctx = useContext(KeyContext);
  if (!ctx) throw new Error("useKeys must be used inside <KeyProvider>");
  return ctx;
}
