// Runs ONE payment end to end against the chain: read fresh state, build proofs, set up and verify the proof accounts with the
// payroll helper, then send pay_employee: signed by the helper in AUTOMATIC mode (it is the vault's authorized operator, so no wallet
// prompt), or approved in the admin's wallet in MANUAL mode. Then clean up. Client-only.
import { address, unwrapOption, type Address, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { decryptAccountBalance } from "./decrypt";
import { readOperator } from "./operator";
import { buildPaymentPlan } from "./pay";
import { readAuditorPubkey, readConfidentialAccount, readVaultState, type ConfidentialAccountView } from "./read";
import type { AppRpc } from "./rpc";
import { signAndSend, TxError, type SignAndSendOptions } from "./send";

export type PayStage = "prove" | "create" | "verify" | "transfer" | "close";

/** What went wrong and, crucially, whether the money may already have moved. */
export class PaymentError extends Error {
  constructor(
    message: string,
    readonly stage: PayStage,
    /** True when `pay_employee` was submitted and we could not confirm it either way. Do not blindly retry. */
    readonly maybePaid: boolean,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface PayOneInput {
  rpc: AppRpc;
  /** The vault admin's wallet. In manual mode it approves pay_employee; in automatic mode it is not involved. */
  admin: TransactionSigner;
  /** The payroll helper (already funded; in automatic mode also authorized as the vault's operator). */
  helper: KeyPairSigner;
  /** "automatic": the helper signs pay_employee, no prompt. "manual": the admin's wallet approves each pay_employee. */
  mode: "automatic" | "manual";
  keys: DerivedKeys;
  employee: Address;
  amount: bigint;
  onStage?: (stage: PayStage) => void;
  /** Manual mode: fires each time the wallet is asked to approve the payment (again, if the first window closed). */
  onPrompt?: SignAndSendOptions["onPrompt"];
  /** Manual mode: fires once the wallet has approved. */
  onSigned?: () => void;
}

export interface PayOneResult {
  /** The pay_employee transaction signature (what the auditor view is keyed on). */
  signature: string;
  /** The amount encrypted to the recipient (lib/received-amount.ts), for the run record. */
  receivedAmount: string;
  /** Set if the payment landed but the proof accounts could not be closed (their rent just stays with the helper). */
  closeWarning?: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : "The transaction failed.");

/** The treasury's available-balance ciphertext, the exact bytes the equality proof is built against. */
const availableCiphertext = (treasury: ConfidentialAccountView) => {
  const ext = (unwrapOption(treasury.token.extensions) ?? []).find((e) => e.__kind === "ConfidentialTransferAccount");
  return ext?.__kind === "ConfidentialTransferAccount" ? Uint8Array.from(ext.availableBalance) : null;
};
const sameBytes = (a: Uint8Array | null, b: Uint8Array | null) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/** Token-2022's `ConfidentialTransferBalanceMismatch` (27): the proofs were built against a treasury balance that is no longer current. */
const isBalanceMismatch = (e: unknown) => e instanceof TxError && e.kind === "preflight" && /Balance mismatch|custom program error: #27\b/i.test([e.message, ...e.logs].join("\n"));

/** Proofs built against a treasury snapshot that turned out to be stale. Nothing was sent; proving again from a fresh read fixes it. */
class StaleTreasury extends Error {}

/** How many times a payment is re-proved when the treasury changed under it. */
const STALE_RETRIES = 1;

export async function payOne(input: PayOneInput): Promise<PayOneResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await payOnce(input);
    } catch (e) {
      if (!(e instanceof StaleTreasury)) throw e;
      if (attempt >= STALE_RETRIES) {
        throw new PaymentError("The treasury balance kept changing while this payment was being prepared, so nothing was sent. Make sure nothing else (another tab, a funding) is using the treasury, then retry.", "transfer", false);
      }
    }
  }
}

async function payOnce(input: PayOneInput): Promise<PayOneResult> {
  const { rpc, admin: adminWallet, helper, mode, keys, employee, amount, onStage, onPrompt, onSigned } = input;
  const admin = address(adminWallet.address);
  const stage = (s: PayStage) => onStage?.(s);
  stage("prove");

  // ---- Fresh state. The treasury's ciphertext must be the current one, or the equality proof is built against stale data.
  const vault = await readVaultState(rpc, admin);
  if (!vault.exists || !vault.treasuryConfigured || !vault.treasury) throw new PaymentError("Set up your company before paying.", "prove", false);
  if (vault.paused) throw new PaymentError("Payroll is paused. Resume it to pay.", "prove", false);
  const provedAgainst = availableCiphertext(vault.treasury);

  const operator = mode === "automatic" ? await readOperator(rpc, admin, helper.address) : null;
  if (operator && !operator.authorized) throw new PaymentError("Automatic payroll isn't authorized any more (it expired, was revoked or used up its payments). Run again to authorize it.", "prove", false);

  const recipient = await readConfidentialAccount(rpc, employee);
  if (!recipient || !recipient.confidential) throw new PaymentError("This person hasn't set up their account yet, so they can't receive pay.", "prove", false);
  if (!recipient.approved || !recipient.elgamalPubkey) throw new PaymentError("This person's account isn't approved to receive confidential pay yet.", "prove", false);

  const [auditor, treasuryBalance] = await Promise.all([readAuditorPubkey(rpc), decryptAccountBalance(vault.treasury, keys)]);
  if (treasuryBalance.available < amount) throw new PaymentError("The treasury's spendable balance is less than this payment.", "prove", false);

  let plan;
  try {
    plan = await buildPaymentPlan({
      rpc,
      admin,
      helper,
      payer: mode === "automatic" ? helper : adminWallet,
      keys,
      treasury: vault.treasury,
      treasuryAvailable: treasuryBalance.available,
      employeeTokenAccount: recipient.address,
      employeeElgamalPubkey: address(recipient.elgamalPubkey),
      auditorElgamalPubkey: auditor,
      amount,
    });
  } catch (e) {
    throw new PaymentError(describe(e), "prove", false);
  }

  // ---- Steps that only need the helper: no wallet prompt, so nothing here can stall on a human.
  const withHelper = (instructions: typeof plan.create.instructions) => signAndSend({ rpc, signer: helper, instructions });

  stage("create");
  try {
    await withHelper(plan.create.instructions);
  } catch (e) {
    throw new PaymentError(describe(e), "create", false);
  }

  stage("verify");
  try {
    await Promise.all(plan.verify.map((spec) => withHelper(spec.instructions)));
  } catch (e) {
    throw new PaymentError(describe(e), "verify", false);
  }

  // Once the proofs exist, a failure still leaves three funded accounts behind. The helper can close them without any prompt.
  const closeContexts = () => withHelper(plan.close.instructions);

  // The proofs only work against the exact treasury balance they were built from. Check it is still that one (a read pinned to every
  // transaction we have confirmed), so a stale snapshot costs a re-prove instead of a rejected payment, and in manual mode never reaches
  // the wallet.
  const current = await readVaultState(rpc, admin).catch(() => null);
  if (current?.treasury && !sameBytes(availableCiphertext(current.treasury), provedAgainst)) {
    await closeContexts().catch(() => undefined);
    throw new StaleTreasury();
  }

  // ---- pay_employee. Automatic: signed by the helper as the authorized operator, so nothing waits on a human. Manual: the ONE wallet
  // approval of this payment (its blockhash is fetched right before the prompt, and the wallet's simulation passes because the proofs
  // are already verified on-chain).
  stage("transfer");
  let signature: string;
  try {
    ({ signature } = await signAndSend({ rpc, signer: mode === "automatic" ? helper : adminWallet, instructions: plan.transfer.instructions, onPrompt, onSigned }));
  } catch (e) {
    // Rejected up front (preflight) or expired before sending: nothing moved. If it may have reached the network
    // (a timeout, a dropped connection) we cannot know, so the row says to check before retrying.
    const submitted = e instanceof TxError ? e.submitted : true;
    // Free the proof accounts' rent unless the payment may have landed (its contexts are then still referenced).
    if (!submitted) await closeContexts().catch(() => undefined);
    if (isBalanceMismatch(e)) throw new StaleTreasury();
    throw new PaymentError(describe(e), "transfer", submitted);
  }

  stage("close");
  try {
    await closeContexts();
    return { signature, receivedAmount: plan.receivedAmount };
  } catch (e) {
    return { signature, receivedAmount: plan.receivedAmount, closeWarning: `The payment went through, but the temporary proof accounts could not be closed: ${describe(e)} Their rent stays in your payroll helper.` };
  }
}
