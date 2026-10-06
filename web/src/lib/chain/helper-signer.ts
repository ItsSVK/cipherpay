// CLIENT-ONLY. A small "payroll helper" key that pays for and signs the proof-account transactions silently, so the admin's
// wallet only ever has to approve ONE small transaction per payment (pay_employee, the one the program requires the admin for).
//
// Why: a payment needs five other transactions (create the proof accounts, verify three proofs, close them). Asking the wallet to
// approve all six at once made the popup slow (the wallet simulates each, and those that depend on accounts that don't exist yet
// fail), and the whole batch shared one blockhash, so a slow approval closed the window. Nothing about those five transactions
// needs the admin: the program only checks that the proofs are verified, not who created the proof accounts.
//
// The helper is derived from the wallet's own confidential keys (so the same wallet always gets the same helper, and any SOL left
// in it is recoverable), holds only a few thousandths of a SOL, and is never persisted or sent anywhere.
import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import type { DerivedKeys } from "@/lib/crypto/keys";
import type { AppRpc } from "./rpc";
import { signAndSend, type SignAndSendOptions } from "./send";

/** Rent for the three proof accounts (about 0.0036 SOL, refunded when they close) plus fees, with headroom. */
export const HELPER_MIN_LAMPORTS = 6_000_000n;
/** What the helper is topped up to. */
export const HELPER_TOPUP_LAMPORTS = 8_000_000n;
/** One signature's fee, kept back when sweeping so the sweep itself can pay. */
const FEE_LAMPORTS = 5_000n;

/** Domain-separated derivation: one-way from the ElGamal secret, so the helper key reveals nothing about it. */
export async function deriveHelperSigner(keys: DerivedKeys): Promise<KeyPairSigner> {
  const label = new TextEncoder().encode("cipherpay/payroll-helper/v1");
  const material = new Uint8Array(keys.elgamalKeypair.secretKey.length + label.length);
  material.set(keys.elgamalKeypair.secretKey, 0);
  material.set(label, keys.elgamalKeypair.secretKey.length);
  const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  try {
    return await createKeyPairSignerFromPrivateKeyBytes(seed);
  } finally {
    seed.fill(0);
    material.fill(0);
  }
}

async function balanceOf(rpc: AppRpc, helper: KeyPairSigner): Promise<bigint> {
  return (await rpc.getBalance(helper.address, { commitment: "confirmed" }).send()).value;
}

/** Tops the helper up from the admin's wallet if it is short. Returns true if it asked the wallet to approve a transfer. */
export async function ensureHelperFunded(input: { rpc: AppRpc; admin: TransactionSigner; helper: KeyPairSigner; onPrompt?: SignAndSendOptions["onPrompt"]; onSigned?: () => void; /** Called just before the wallet is asked, with the exact amount, so the UI can explain the popup. */ onNeedTopUp?: (lamports: bigint) => void }): Promise<boolean> {
  const { rpc, admin, helper, onPrompt, onSigned, onNeedTopUp } = input;
  const balance = await balanceOf(rpc, helper);
  if (balance >= HELPER_MIN_LAMPORTS) return false;
  onNeedTopUp?.(HELPER_TOPUP_LAMPORTS - balance);
  await signAndSend({ rpc, signer: admin, instructions: [getTransferSolInstruction({ source: admin, destination: helper.address, amount: HELPER_TOPUP_LAMPORTS - balance })], onPrompt, onSigned });
  return true;
}

/** Returns whatever the helper holds to the admin. Needs no wallet approval. Best-effort: a failure just leaves the SOL for next time. */
export async function sweepHelper(input: { rpc: AppRpc; admin: TransactionSigner; helper: KeyPairSigner }): Promise<bigint> {
  const { rpc, admin, helper } = input;
  const balance = await balanceOf(rpc, helper);
  if (balance <= FEE_LAMPORTS * 2n) return 0n;
  const amount = balance - FEE_LAMPORTS;
  await signAndSend({ rpc, signer: helper, instructions: [getTransferSolInstruction({ source: helper, destination: admin.address, amount })] });
  return amount;
}
