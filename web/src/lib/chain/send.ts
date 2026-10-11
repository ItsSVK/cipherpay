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
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { noteSlot } from "./freshness";
import type { AppRpc } from "./rpc";

export type TxErrorKind = "rejected" | "preflight" | "expired" | "failed";

export class TxError extends Error {
  constructor(
    message: string,
    readonly kind: TxErrorKind,
    readonly logs: readonly string[] = [],
    /**
     * Whether the transaction may have reached the network. False means we know nothing was sent (declined in the wallet,
     * rejected by the preflight check, expired before sending), so retrying is safe. True means the outcome is unknown.
     */
    readonly submitted = false,
  ) {
    super(message);
    this.name = "TxError";
  }
}

const CONFIRM_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GENERIC_PROGRAM_LINE = /^Program \S+ (invoke|success|consumed|failed)/;

/**
 * The most useful line from a failed transaction's logs: the one that says WHY ("Transfer: insufficient lamports ...",
 * "Error Message: ..."), not the generic "Program X failed" that always follows it.
 */
export function failingLogLine(logs: readonly string[]): string | undefined {
  const reasons = logs.filter((l) => /error|fail|insufficient|invalid|not enough|exceed/i.test(l));
  return [...reasons].reverse().find((l) => !GENERIC_PROGRAM_LINE.test(l)) ?? reasons[reasons.length - 1];
}

const WINDOW_CLOSED = "The approval window closed before the transaction could be sent, so nothing was sent. Run it again and approve quickly: devnet only keeps a transaction valid for about 40 seconds.";

function isPreflight(e: unknown) {
  return isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE);
}

/** "Blockhash not found" from the network's pre-send simulation. It carries no logs, which is why it used to look like a vague failure. */
function isBlockhashNotFound(e: unknown) {
  return isPreflight(e) && isSolanaError((e as { cause?: unknown }).cause, SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND);
}

/** Turns anything thrown while sending into one clear message, keeping the network's own reason instead of hiding it. */
export function toTxError(e: unknown): TxError {
  if (e instanceof TxError) return e;
  if (isPreflight(e)) {
    const logs = (e as { context?: { logs?: readonly string[] | null } }).context?.logs ?? [];
    const cause = (e as { cause?: { message?: string } }).cause?.message;
    const line = failingLogLine(logs);
    return new TxError(`The network rejected the transaction before sending it${cause ? `: ${cause}` : ""}.${line ? ` ${line}` : ""}`, "preflight", logs, false);
  }
  const msg = e instanceof Error ? e.message : String(e);
  // Wallets word a closed or declined prompt in many ways.
  if (/reject|declin|denied|cancel|closed|user/i.test(msg)) return new TxError("You declined the request in your wallet.", "rejected");
  // Anything else (a dropped connection, say) may or may not have reached the network, so treat the outcome as unknown.
  return new TxError(msg || "The transaction failed.", "failed", [], true);
}

/** Polls until `signature` is confirmed, failed on-chain, or its blockhash expires. */
export async function waitForConfirmation(rpc: AppRpc, signature: Parameters<AppRpc["getSignatureStatuses"]>[0][number], lastValidBlockHeight: bigint): Promise<void> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new TxError(`The transaction was included but failed on-chain: ${JSON.stringify(status.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`, "failed", [], false);
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      // Every later read must see this transaction, even when it is answered by a node behind the one that confirmed it.
      noteSlot(status.slot);
      return;
    }
    if ((await rpc.getBlockHeight({ commitment: "confirmed" }).send()) > lastValidBlockHeight) {
      throw new TxError("The transaction expired before the network confirmed it. Nothing was charged. Try again.", "expired", [], true);
    }
    await sleep(1200);
  }
  throw new TxError("Still waiting on the network. Check your wallet's activity before trying again so you don't send it twice.", "expired", [], true);
}

/** A blockhash and how long it can still be used. */
export interface Lifetime {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
  /** Blocks left before it expires, measured when it was fetched. Devnet makes roughly 3.8 blocks a second, so 150 blocks is about 40 s. */
  lifeBlocks: bigint;
}

/** Below this the wallet would have to answer in under ~30 s on devnet, so we ask the RPC for a fresher blockhash. */
const MIN_LIFE_BLOCKS = 120n;

/**
 * Which blockhash to hand the wallet. Wallets simulate the transaction on THEIR OWN RPC node before showing the popup, and a
 * blockhash taken from the freshest `confirmed` tip of our RPC may not exist on their node yet, so they keep retrying the simulation
 * (a user saw the popup appear ~30 s late and then take ~9 s to enable Confirm, a steady ~39 s that is exactly the window). A
 * `finalized` blockhash is old enough for every node to know. The first attempt uses it; the fallback is the usual `confirmed`.
 */
const ATTEMPT_COMMITMENT = ["finalized", "confirmed"] as const;

/**
 * Fetches a blockhash and checks how much life it really has. Some RPC providers cache or lag their answers, handing back a
 * blockhash that is already partly used up, which leaves almost no time for a wallet approval. If the first answer is stale we
 * ask again (a few times) and keep the freshest.
 */
export async function getFreshLifetime(rpc: AppRpc, commitment: "confirmed" | "finalized" = "confirmed"): Promise<Lifetime> {
  let best: Lifetime | null = null;
  for (let i = 0; i < 5; i++) {
    const [{ value: latest }, height] = await Promise.all([rpc.getLatestBlockhash({ commitment }).send(), rpc.getBlockHeight({ commitment: "confirmed" }).send()]);
    const candidate: Lifetime = { blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, lifeBlocks: latest.lastValidBlockHeight - height };
    if (!best || candidate.lifeBlocks > best.lifeBlocks) best = candidate;
    if (candidate.lifeBlocks >= MIN_LIFE_BLOCKS) break;
    await sleep(500);
  }
  return best as Lifetime;
}

const BLOCKHASH_RETRIES = 6;
const BLOCKHASH_RETRY_MS = 1500;

/**
 * Sends a signed transaction, tolerating an RPC node that hasn't seen the blockhash yet. Dedicated endpoints are often several
 * nodes behind a load balancer, so the node that hands out a blockhash can be ahead of the node that checks the send. A rejected
 * preflight sends nothing, so retrying the SAME signed transaction is safe, until its window has genuinely closed.
 */
async function sendWithBlockhashRetry(rpc: AppRpc, wireBase64: Parameters<AppRpc["sendTransaction"]>[0], lastValidBlockHeight: bigint): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rpc.sendTransaction(wireBase64, { encoding: "base64", preflightCommitment: "confirmed" }).send();
      return;
    } catch (e) {
      if (!isBlockhashNotFound(e)) throw e;
      if ((await rpc.getBlockHeight({ commitment: "confirmed" }).send()) > lastValidBlockHeight) throw new TxError(WINDOW_CLOSED, "expired", [], false);
      if (attempt >= BLOCKHASH_RETRIES) {
        throw new TxError("The network node checking this transaction doesn't recognise its blockhash, even though the window is still open. That usually means your RPC endpoint is out of sync. Try again, or switch RPC provider.", "preflight", [], false);
      }
      await sleep(BLOCKHASH_RETRY_MS);
    }
  }
}

/** Devnet makes roughly 3.8 blocks a second, so this turns a blockhash's remaining blocks into seconds for display. */
export const BLOCKS_PER_SECOND = 3.8;

export interface SignAndSendOptions {
  rpc: AppRpc;
  signer: TransactionSigner;
  instructions: readonly Instruction[];
  /** Fires once the wallet has approved. */
  onSigned?: () => void;
  /** Fires right before each time the wallet is asked, with when this attempt's blockhash will expire (ms since epoch). */
  onPrompt?: (info: { attempt: number; expiresAtMs: number }) => void;
  /**
   * How many times to ask the wallet AGAIN if the approval window closed before anything was sent. Safe, because nothing reached
   * the network. Kept low: if a wallet's delay is steady, more popups only make it worse.
   */
  retryOnExpiry?: number;
}

/**
 * Signs with the wallet, sends through our RPC, and waits for `confirmed`. If the wallet takes longer than the network keeps the
 * blockhash valid, the transaction is rebuilt with a fresh blockhash and the wallet is asked again, up to `retryOnExpiry` times.
 */
/**
 * How many wallet approvals are open right now. A browser wallet's popup does NOT hide the page, so our polling and the
 * decryption it triggers would otherwise keep running on the main thread exactly while the wallet is trying to open and
 * simulate. Background work stands down while this is above zero.
 */
let promptsOpen = 0;
const promptListeners = new Set<(open: boolean) => void>();

export const walletPromptOpen = () => promptsOpen > 0;

/** Subscribes to "is a wallet approval open". Returns an unsubscribe. */
export function onWalletPromptChange(fn: (open: boolean) => void): () => void {
  promptListeners.add(fn);
  return () => void promptListeners.delete(fn);
}

function setPromptOpen(delta: number) {
  const before = promptsOpen > 0;
  promptsOpen = Math.max(0, promptsOpen + delta);
  const after = promptsOpen > 0;
  if (before !== after) for (const fn of promptListeners) fn(after);
}

export async function signAndSend(input: SignAndSendOptions): Promise<{ signature: string }> {
  const { rpc, signer, instructions, onSigned, onPrompt, retryOnExpiry = 1 } = input;
  for (let attempt = 0; ; attempt++) {
    try {
      const commitment = ATTEMPT_COMMITMENT[Math.min(attempt, ATTEMPT_COMMITMENT.length - 1)];
      const life = await getFreshLifetime(rpc, commitment);
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: life.blockhash, lastValidBlockHeight: life.lastValidBlockHeight }, m),
        (m) => appendTransactionMessageInstructions(instructions, m),
      );
      setPromptOpen(1);
      onPrompt?.({ attempt, expiresAtMs: Date.now() + (Number(life.lifeBlocks) / BLOCKS_PER_SECOND) * 1000 });
      const signStart = Date.now();
      let signed;
      try {
        signed = await signTransactionMessageWithSigners(message);
      } finally {
        setPromptOpen(-1);
      }
      const signSeconds = Math.round((Date.now() - signStart) / 1000);
      const signature = getSignatureFromTransaction(signed);
      onSigned?.();
      try {
        await sendWithBlockhashRetry(rpc, getBase64EncodedWireTransaction(signed), life.lastValidBlockHeight);
      } catch (e) {
        // Say WHY the window closed, with the numbers, so a slow wallet and a stale RPC can be told apart.
        if (e instanceof TxError && e.kind === "expired" && !e.submitted) {
          throw new TxError(`${e.message} (Details: the blockhash had ${life.lifeBlocks} blocks of life when fetched, about ${Math.round(Number(life.lifeBlocks) / BLOCKS_PER_SECOND)} s, and the wallet took ${signSeconds} s to sign; blockhash source: ${commitment}.)`, "expired", [], false);
        }
        throw e;
      }
      await waitForConfirmation(rpc, signature, life.lastValidBlockHeight);
      return { signature };
    } catch (e) {
      const err = toTxError(e);
      // Only a window that closed BEFORE sending is safe to redo: nothing reached the network, so a second prompt can't double-spend.
      if (err.kind === "expired" && !err.submitted && attempt < retryOnExpiry) continue;
      throw err;
    }
  }
}
