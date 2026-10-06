// Runs ONE payment end to end against the chain: read fresh state, build proofs, set up and verify the proof accounts with the
// payroll helper, send pay_employee as the helper (the vault's authorized operator, so no wallet prompt), then clean up. Client-only.
import { address, type Address, type KeyPairSigner } from "@solana/kit";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { decryptAccountBalance } from "./decrypt";
import { readOperator } from "./operator";
import { buildPaymentPlan } from "./pay";
import { readAuditorPubkey, readConfidentialAccount, readVaultState } from "./read";
import type { AppRpc } from "./rpc";
import { signAndSend, TxError } from "./send";

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
  /** The vault admin's address. Its wallet is not involved in a payment. */
  admin: Address;
  /** The payroll helper (already funded and authorized as the vault's operator): signs every transaction without a wallet prompt. */
  helper: KeyPairSigner;
  keys: DerivedKeys;
  employee: Address;
  amount: bigint;
  onStage?: (stage: PayStage) => void;
}

export interface PayOneResult {
  /** The pay_employee transaction signature (what the auditor view is keyed on). */
  signature: string;
  /** Set if the payment landed but the proof accounts could not be closed (their rent just stays with the helper). */
  closeWarning?: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : "The transaction failed.");

export async function payOne(input: PayOneInput): Promise<PayOneResult> {
  const { rpc, admin, helper, keys, employee, amount, onStage } = input;
  const stage = (s: PayStage) => onStage?.(s);
  stage("prove");

  // ---- Fresh state. The treasury's ciphertext must be the current one, or the equality proof is built against stale data.
  const vault = await readVaultState(rpc, admin);
  if (!vault.exists || !vault.treasuryConfigured || !vault.treasury) throw new PaymentError("Set up your company before paying.", "prove", false);
  if (vault.paused) throw new PaymentError("Payroll is paused. Resume it to pay.", "prove", false);

  const operator = await readOperator(rpc, admin, helper.address);
  if (!operator.authorized) throw new PaymentError("The payroll helper isn't authorized (or its authorization has run out). Authorize it and try again.", "prove", false);

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

  // ---- pay_employee, signed by the helper as the authorized operator: no wallet prompt, so nothing here waits on a human.
  stage("transfer");
  let signature: string;
  try {
    ({ signature } = await signAndSend({ rpc, signer: helper, instructions: plan.transfer.instructions }));
  } catch (e) {
    // Rejected up front (preflight) or expired before sending: nothing moved. If it may have reached the network
    // (a timeout, a dropped connection) we cannot know, so the row says to check before retrying.
    const submitted = e instanceof TxError ? e.submitted : true;
    // Free the proof accounts' rent unless the payment may have landed (its contexts are then still referenced).
    if (!submitted) await closeContexts().catch(() => undefined);
    throw new PaymentError(describe(e), "transfer", submitted);
  }

  stage("close");
  try {
    await closeContexts();
    return { signature };
  } catch (e) {
    return { signature, closeWarning: `The payment went through, but the temporary proof accounts could not be closed: ${describe(e)} Their rent stays in your payroll helper.` };
  }
}
