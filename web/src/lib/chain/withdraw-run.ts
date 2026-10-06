// Runs ONE employee cash-out end to end against the chain: apply any pending pay, prove, set up the proof accounts with the payroll helper,
// then the owner's wallet signs the withdraw (and unwrap), then clean up. Client-only.
//
// Wallet approvals, in the common case: ONE for [apply pending (+ helper top-up if the helper is short)] and ONE for [withdraw (+ unwrap)].
// Everything else (creating, verifying and closing the proof accounts) is signed silently by the helper, so a slow wallet popup can only
// ever delay a step, never invalidate the proofs that are already on-chain.
import { address, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { decryptAccountBalance } from "./decrypt";
import { buildApplyPendingInstruction, buildWithdrawPlan } from "./receive";
import { readConfidentialAccount } from "./read";
import type { AppRpc } from "./rpc";
import { signAndSend, TxError, type SignAndSendOptions } from "./send";

/** The helper's rent for the two proof accounts of a withdrawal (about 0.0055 SOL on devnet, a little more on a surfpool fork, refunded on close) plus fees. */
export const WITHDRAW_HELPER_MIN_LAMPORTS = 8_000_000n;
/** What the helper is topped up to when it is short. */
export const WITHDRAW_HELPER_TOPUP_LAMPORTS = 10_000_000n;
/** Kept in the wallet for its own fees and, when unwrapping, the rent of a first plain-USDC account. */
const WALLET_RESERVE_LAMPORTS = 3_000_000n;

export type WithdrawStage = "apply" | "prove" | "create" | "verify" | "withdraw" | "close";

export class WithdrawError extends Error {
  constructor(
    message: string,
    readonly stage: WithdrawStage,
    /** True when the withdraw was submitted and we could not confirm it either way. Check the balance before retrying. */
    readonly maybeSent: boolean,
  ) {
    super(message);
    this.name = "WithdrawError";
  }
}

export interface WithdrawOnceInput {
  rpc: AppRpc;
  /** The wallet that owns the account. */
  owner: TransactionSigner;
  /** The payroll helper (derived from the owner's keys; see helper-signer.ts). */
  helper: KeyPairSigner;
  keys: DerivedKeys;
  amount: bigint;
  unwrap: boolean;
  onStage?: (stage: WithdrawStage) => void;
  /** Fires each time the wallet is asked to approve (again, if a window closed). */
  onPrompt?: SignAndSendOptions["onPrompt"];
  onSigned?: () => void;
}

export interface WithdrawOnceResult {
  /** The signature of the withdraw (and unwrap) transaction. */
  signature: string;
  /** Set when the money moved but the temporary proof accounts could not be closed (their rent stays in the helper). */
  closeWarning?: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : "The transaction failed.");
const lamportsOf = async (rpc: AppRpc, a: string) => (await rpc.getBalance(address(a), { commitment: "confirmed" }).send()).value;

export async function withdrawOnce(input: WithdrawOnceInput): Promise<WithdrawOnceResult> {
  const { rpc, owner, helper, keys, amount, unwrap, onStage, onPrompt, onSigned } = input;
  const ownerAddress = address(owner.address);
  const stage = (s: WithdrawStage) => onStage?.(s);
  stage("prove");

  let account = await readConfidentialAccount(rpc, ownerAddress);
  if (!account || !account.confidential) throw new WithdrawError("Set up your account before withdrawing.", "prove", false);
  if (!account.approved) throw new WithdrawError("Your account isn't approved for confidential use yet.", "prove", false);

  let balance;
  try {
    balance = await decryptAccountBalance(account, keys);
  } catch (e) {
    throw new WithdrawError(describe(e), "prove", false);
  }
  if (balance.available + balance.pending < amount) throw new WithdrawError("That is more than your balance.", "prove", false);

  // ---- Wallet approval 1 (only when there is something to do): apply pending pay, and top the helper up if it is short, in one transaction.
  const helperLamports = await lamportsOf(rpc, helper.address);
  const topUp = helperLamports < WITHDRAW_HELPER_MIN_LAMPORTS ? WITHDRAW_HELPER_TOPUP_LAMPORTS - helperLamports : 0n;
  const walletLamports = await lamportsOf(rpc, ownerAddress);
  if (walletLamports < topUp + WALLET_RESERVE_LAMPORTS) {
    throw new WithdrawError("This wallet doesn't have enough SOL for the network fees. Add a little devnet SOL and try again.", "prove", false);
  }
  if (balance.pending > 0n || topUp > 0n) {
    stage("apply");
    try {
      const instructions = [
        ...(topUp > 0n ? [getTransferSolInstruction({ source: owner, destination: helper.address, amount: topUp })] : []),
        ...(balance.pending > 0n ? [await buildApplyPendingInstruction({ account, keys, owner })] : []),
      ];
      await signAndSend({ rpc, signer: owner, instructions, onPrompt, onSigned });
    } catch (e) {
      throw new WithdrawError(describe(e), "apply", false);
    }
    if (balance.pending > 0n) {
      // The proofs must be built against the account as it is NOW: applying changed its available ciphertext.
      account = await readConfidentialAccount(rpc, ownerAddress);
      if (!account) throw new WithdrawError("Could not read your account after applying your pending pay.", "apply", false);
      balance = await decryptAccountBalance(account, keys).catch((e) => {
        throw new WithdrawError(describe(e), "apply", false);
      });
      stage("prove");
    }
  }
  if (balance.available < amount) throw new WithdrawError("Your pending pay hasn't been applied yet. Try again in a moment.", "prove", false);

  let plan;
  try {
    plan = await buildWithdrawPlan({ rpc, owner, helper, keys, account, available: balance.available, amount, unwrap });
  } catch (e) {
    throw new WithdrawError(describe(e), "prove", false);
  }

  // ---- Steps that only need the helper: no wallet prompt, so nothing here waits on a human.
  const withHelper = (instructions: typeof plan.create.instructions) => signAndSend({ rpc, signer: helper, instructions });
  stage("create");
  try {
    await withHelper(plan.create.instructions);
  } catch (e) {
    throw new WithdrawError(describe(e), "create", false);
  }
  stage("verify");
  try {
    await Promise.all(plan.verify.map((spec) => withHelper(spec.instructions)));
  } catch (e) {
    throw new WithdrawError(describe(e), "verify", false);
  }
  const closeContexts = () => withHelper(plan.close.instructions);

  // ---- Wallet approval 2: the withdraw (and unwrap). Its blockhash is fetched right before the prompt, and the wallet's simulation
  // passes because the proofs are already verified on-chain.
  stage("withdraw");
  let signature: string;
  try {
    ({ signature } = await signAndSend({ rpc, signer: owner, instructions: plan.withdraw.instructions, onPrompt, onSigned }));
  } catch (e) {
    const submitted = e instanceof TxError ? e.submitted : true;
    // Free the proof accounts' rent unless the withdraw may have landed (its contexts are then still referenced).
    if (!submitted) await closeContexts().catch(() => undefined);
    throw new WithdrawError(describe(e), "withdraw", submitted);
  }

  stage("close");
  try {
    await closeContexts();
    return { signature };
  } catch (e) {
    return { signature, closeWarning: `Your withdrawal went through, but the temporary proof accounts could not be closed: ${describe(e)} Their rent stays in your helper key.` };
  }
}
