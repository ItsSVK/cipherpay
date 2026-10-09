/// <reference lib="webworker" />
// CLIENT-ONLY. The proof worker: runs the heavy WASM work (confidential-transfer proofs, withdraw proofs, balance decryption) off the main
// thread, so the page stays responsive while a payment or withdrawal is being proved. Loaded by proof-client.ts, never directly.
//
// Keys: the caller sends the secret material it needs with each request (a structured-clone COPY, so the page keeps its own). This worker
// is same-origin and in the same browser tab, so the "keys never leave the browser" rule still holds, and it keeps NOTHING between
// requests: every secret it was handed is overwritten with zeros as soon as the request finishes, success or failure.
import { decryptAccountBalanceLocal } from "@/lib/chain/decrypt-local";
import { openReceivedAmountsLocal } from "@/lib/chain/received-amount-local";
import { composeTransferProofs } from "@/lib/chain/transfer-proofs";
import { composeWithdrawProofs } from "@/lib/chain/withdraw-proofs";
import type { WorkerRequest, WorkerResponse } from "./proof-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function handle(req: WorkerRequest): Promise<unknown> {
  switch (req.op) {
    case "transfer":
      try {
        return await composeTransferProofs(req.input);
      } finally {
        req.input.sourceSecretKey.fill(0);
      }
    case "withdraw":
      try {
        return await composeWithdrawProofs(req.input);
      } finally {
        req.input.secretKey.fill(0);
      }
    case "decrypt":
      try {
        return await decryptAccountBalanceLocal(req.view, req.keys);
      } finally {
        req.keys.aeKey.fill(0);
        req.keys.elgamalKeypair.secretKey.fill(0);
      }
    case "openReceived":
      try {
        return await openReceivedAmountsLocal(req.encoded, req.secretKey);
      } finally {
        req.secretKey.fill(0);
      }
  }
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  let res: WorkerResponse;
  try {
    res = { id: req.id, ok: true, value: await handle(req) };
  } catch (e) {
    res = { id: req.id, ok: false, name: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(res);
};
