"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { describeDerivationError, wipeKeys, type DerivedKeys } from "@/lib/crypto/keys";

export type KeyStatus = "locked" | "deriving" | "ready";

/**
 * How keys are obtained. Members derive them from a wallet signature. The auditor key is NOT
 * wallet-derived (it is a standalone secret set on the mint), so the auditor imports it instead.
 */
export type KeyMode = "signature" | "import";

export const KEY_COPY: Record<KeyMode, { stages: readonly [string, string, string]; descriptions: readonly [string, string, string] }> = {
  signature: {
    stages: ["Wallet signature", "ElGamal key", "AES key"],
    descriptions: [
      "Your wallet signs one fixed message. It costs nothing and nothing is sent anywhere.",
      "Derived from that signature, inside this tab. This is the key that decrypts your amounts.",
      "Also derived from the same signature. It reads your own balance so the app can build your next transfer.",
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
/** After a real signature the two keys are already derived; these beats just let the dialog show each one landing. */
const REAL_BEAT_MS = 380;

/** Derives real keys from the connected wallet. Provided only for real (non-demo) wallets. */
export type KeyDeriver = () => Promise<DerivedKeys>;

interface KeyState {
  mode: KeyMode;
  /** True when keys come from a real wallet signature, false for the demo animation. */
  real: boolean;
  status: KeyStatus;
  /** Index of the stage currently running (0-2), or 3 when finished. */
  stage: number;
  /** Why the last attempt failed (declined prompt, wallet rewrote the message, ...). */
  error: string | null;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  /** Starts derivation: asks the wallet to sign (real) or plays the demo animation. */
  unlock: () => void;
  /** Clears keys from memory. Also happens on wallet disconnect or account change (the provider remounts). */
  lock: () => void;
  ready: boolean;
  /** The public ElGamal key, once derived. Safe to display and to register on-chain. */
  elgamalPubkey: string | null;
  /** The derived key material, or null while locked. Hold it only for the duration of an operation; never store or send it. */
  getKeys: () => DerivedKeys | null;
  /** Increments every time keys are cleared, so views can drop anything decrypted under the old keys. */
  epoch: number;
  /** Ask for keys when the user hits something that needs them. */
  requireKeys: () => boolean;
}

const KeyContext = createContext<KeyState | null>(null);

export function KeyProvider({ children, mode = "signature", deriver }: { children: React.ReactNode; mode?: KeyMode; deriver?: KeyDeriver }) {
  const [status, setStatus] = useState<KeyStatus>("locked");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [elgamalPubkey, setElgamalPubkey] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Key material lives in a ref, not state: it never renders and never ends up in a React tree snapshot.
  const keysRef = useRef<DerivedKeys | null>(null);
  const deriverRef = useRef(deriver);
  const attempt = useRef(0);
  useEffect(() => {
    deriverRef.current = deriver;
  });

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(
    () => () => {
      clear();
      attempt.current += 1; // a derivation still in flight must not publish keys after unmount
      wipeKeys(keysRef.current);
      keysRef.current = null;
    },
    [],
  );

  const finish = useCallback(() => {
    setStatus("ready");
    timers.current.push(setTimeout(() => setDialogOpen(false), 850));
  }, []);

  const unlock = useCallback(() => {
    if (status !== "locked") return;
    clear();
    setError(null);
    setStatus("deriving");
    setStage(0);

    const derive = deriverRef.current;
    if (derive) {
      const mine = ++attempt.current;
      derive().then(
        (keys) => {
          if (mine !== attempt.current) {
            wipeKeys(keys);
            return;
          }
          keysRef.current = keys;
          setElgamalPubkey(keys.elgamalKeypair.elgamalPubkey);
          setStage(1);
          timers.current.push(setTimeout(() => setStage(2), REAL_BEAT_MS));
          timers.current.push(setTimeout(() => { setStage(3); finish(); }, REAL_BEAT_MS * 2));
        },
        (e) => {
          if (mine !== attempt.current) return;
          setError(describeDerivationError(e));
          setStatus("locked");
          setStage(0);
        },
      );
      return;
    }

    // Demo wallets: no signature exists, so play the animation only.
    let at = 0;
    STAGE_MS.forEach((ms, i) => {
      at += ms;
      timers.current.push(
        setTimeout(() => {
          setStage(i + 1);
          if (i === STAGE_MS.length - 1) finish();
        }, at),
      );
    });
  }, [status, finish]);

  const lock = useCallback(() => {
    clear();
    attempt.current += 1;
    wipeKeys(keysRef.current);
    keysRef.current = null;
    setElgamalPubkey(null);
    setError(null);
    setStatus("locked");
    setStage(0);
    setEpoch((n) => n + 1);
  }, []);

  const getKeys = useCallback(() => keysRef.current, []);

  const value = useMemo<KeyState>(
    () => ({
      mode,
      real: !!deriver,
      status,
      stage,
      error,
      dialogOpen,
      setDialogOpen,
      unlock,
      lock,
      ready: status === "ready",
      elgamalPubkey,
      getKeys,
      epoch,
      requireKeys: () => {
        if (status === "ready") return true;
        setDialogOpen(true);
        return false;
      },
    }),
    [mode, deriver, status, stage, error, dialogOpen, elgamalPubkey, getKeys, epoch, unlock, lock],
  );

  return <KeyContext.Provider value={value}>{children}</KeyContext.Provider>;
}

export function useKeys(): KeyState {
  const ctx = useContext(KeyContext);
  if (!ctx) throw new Error("useKeys must be used inside <KeyProvider>");
  return ctx;
}
