// The messages between the page and the proof worker. Types only: everything here must survive a structured clone (bigint, Uint8Array and
// plain objects do; class instances and functions do not).
import type { DerivedKeys } from "./keys";
import type { ConfidentialAccountView } from "@/lib/chain/read";
import type { TransferProofInput } from "@/lib/chain/transfer-proofs";
import type { WithdrawProofInput } from "@/lib/chain/withdraw-proofs";

/** Only the parts of an account the decryption reads, so nothing else is copied across. */
export type DecryptView = Pick<ConfidentialAccountView, "token" | "elgamalPubkey">;

export type WorkerRequest =
  | { id: number; op: "transfer"; input: TransferProofInput }
  | { id: number; op: "withdraw"; input: WithdrawProofInput }
  | { id: number; op: "decrypt"; view: DecryptView; keys: DerivedKeys };

export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; name: string; message: string };
