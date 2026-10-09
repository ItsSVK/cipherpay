// CLIENT-ONLY. The page's side of the proof worker (proof-worker.ts). Each function does the same job as its main-thread twin
// (composeTransferProofs, composeWithdrawProofs, decryptAccountBalanceLocal) but on a worker thread, and falls back to running it on the
// calling thread if a worker can't be created or fails to start, so a bundling or browser problem degrades to "a short stutter", not "broken".
import { decryptAccountBalanceLocal, WrongKeyError, type DecryptedBalance } from "@/lib/chain/decrypt-local";
import { openReceivedAmountsLocal } from "@/lib/chain/received-amount-local";
import { composeTransferProofs, type TransferProofInput, type TransferProofs } from "@/lib/chain/transfer-proofs";
import { composeWithdrawProofs, type WithdrawProofInput, type WithdrawProofs } from "@/lib/chain/withdraw-proofs";
import type { DerivedKeys } from "./keys";
import type { DecryptView, WorkerRequest, WorkerResponse } from "./proof-protocol";

/** The worker could not be used at all (not created, or its script failed to load). The caller then runs the work itself. */
class WorkerUnavailable extends Error {}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let broken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(error: Error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function getWorker(): Worker {
  if (broken || typeof Worker === "undefined") throw new WorkerUnavailable("Workers are not available here.");
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./proof-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.value);
      else p.reject(Object.assign(new Error(res.message), { name: res.name }));
    };
    // A script that fails to load or evaluate fires `error` on the worker object. Give up on workers for this page and let callers fall back.
    w.onerror = (event) => {
      broken = true;
      worker?.terminate();
      worker = null;
      failAll(new WorkerUnavailable(event.message || "The proof worker failed to start."));
    };
    worker = w;
    return w;
  } catch (e) {
    broken = true;
    throw new WorkerUnavailable(e instanceof Error ? e.message : "The proof worker could not be created.");
  }
}

/** For tests and diagnostics: whether a worker is running, and whether workers were given up on (so work ran on the calling thread). */
export const proofWorkerStatus = () => ({ running: worker !== null, broken });

type Distribute<T> = T extends { id: number } ? Omit<T, "id"> : never;

function call<T>(request: Distribute<WorkerRequest>): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...request, id });
  });
}

/** Runs on the worker; if the worker is unavailable, runs `local` instead. Real errors from the work itself are never retried. */
async function offThread<T>(request: Distribute<WorkerRequest>, local: () => Promise<T>): Promise<T> {
  try {
    return await call<T>(request);
  } catch (e) {
    if (e instanceof WorkerUnavailable) return local();
    throw e;
  }
}

// The worker zeroes the secrets it is handed, but it works on a structured-clone COPY, so the caller's own keys are untouched.
export const proveTransfer = (input: TransferProofInput): Promise<TransferProofs> => offThread({ op: "transfer", input }, () => composeTransferProofs(input));

export const proveWithdraw = (input: WithdrawProofInput): Promise<WithdrawProofs> => offThread({ op: "withdraw", input }, () => composeWithdrawProofs(input));

/** Opens payment amounts encrypted to this wallet (lib/received-amount.ts); null where one doesn't open. One worker round trip for the whole list. */
export const openReceivedAmounts = (encoded: (string | null)[], keys: DerivedKeys): Promise<(bigint | null)[]> =>
  offThread({ op: "openReceived", encoded, secretKey: keys.elgamalKeypair.secretKey }, () => openReceivedAmountsLocal(encoded, keys.elgamalKeypair.secretKey));

export async function decryptOffThread(view: DecryptView, keys: DerivedKeys): Promise<DecryptedBalance> {
  try {
    return await offThread<DecryptedBalance>({ op: "decrypt", view: { token: view.token, elgamalPubkey: view.elgamalPubkey }, keys }, () => decryptAccountBalanceLocal(view, keys));
  } catch (e) {
    // The worker reports errors by name; restore the one the UI treats specially.
    if (e instanceof Error && e.name === "WrongKeyError" && !(e instanceof WrongKeyError)) throw new WrongKeyError();
    throw e;
  }
}
