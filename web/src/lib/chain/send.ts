// Builds, signs (through the connected wallet) and confirms a transaction. Client-only.
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isSolanaError,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { AppRpc } from "./rpc";

export type TxErrorKind = "rejected" | "preflight" | "expired" | "failed";

export class TxError extends Error {
  constructor(
    message: string,
    readonly kind: TxErrorKind,
    readonly logs: readonly string[] = [],
  ) {
    super(message);
    this.name = "TxError";
  }
}

const CONFIRM_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pulls the most useful line out of program logs, e.g. the failing program's error message. */
function lastErrorLine(logs: readonly string[]): string | undefined {
  return [...logs].reverse().find((l) => /error|failed|insufficient|invalid/i.test(l));
}

function toTxError(e: unknown): TxError {
  if (e instanceof TxError) return e;
  if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
    const logs = (e.context as { logs?: readonly string[] | null }).logs ?? [];
    const line = lastErrorLine(logs);
    return new TxError(`The network rejected the transaction before sending it.${line ? ` ${line}` : ""}`, "preflight", logs);
  }
  const msg = e instanceof Error ? e.message : String(e);
  // Wallets word a closed or declined prompt in many ways.
  if (/reject|declin|denied|cancel|closed|user/i.test(msg)) return new TxError("You declined the request in your wallet.", "rejected");
  return new TxError(msg || "The transaction failed.", "failed");
}

/**
 * Signs with the wallet, sends through our RPC, and waits for `confirmed`. `onSigned` fires once the wallet has
 * approved, so the UI can move from "approve in your wallet" to "waiting for the network".
 */
export async function signAndSend(input: { rpc: AppRpc; signer: TransactionSigner; instructions: readonly Instruction[]; onSigned?: () => void }): Promise<{ signature: string }> {
  const { rpc, signer, instructions, onSigned } = input;
  try {
    const { value: latest } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signed);
    onSigned?.();
    await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" }).send();

    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { value } = await rpc.getSignatureStatuses([signature]).send();
      const status = value[0];
      if (status?.err) throw new TxError(`The transaction was included but failed on-chain: ${JSON.stringify(status.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`, "failed");
      if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return { signature };
      if ((await rpc.getBlockHeight({ commitment: "confirmed" }).send()) > latest.lastValidBlockHeight) {
        throw new TxError("The transaction expired before the network confirmed it. Nothing was charged. Try again.", "expired");
      }
      await sleep(1200);
    }
    throw new TxError("Still waiting on the network. Check your wallet's activity before trying again so you don't send it twice.", "expired");
  } catch (e) {
    throw toTxError(e);
  }
}
