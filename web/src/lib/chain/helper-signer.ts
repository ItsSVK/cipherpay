// CLIENT-ONLY. A small "payroll helper" key that pays for and signs the proof-account transactions silently, so the admin's
// wallet is not asked per payment at all.
//
// Why: a payment needs five other transactions (create the proof accounts, verify three proofs, close them). Asking the wallet to
// approve all six at once made the popup slow (the wallet simulates each, and those that depend on accounts that don't exist yet
// fail), and the whole batch shared one blockhash, so a slow approval closed the window. Nothing about those five transactions
// needs the admin: the program only checks that the proofs are verified, not who created the proof accounts.
//
// The helper is also the vault's authorized OPERATOR: once the admin has SIGNED A MESSAGE authorizing it (authorization.ts),
// it signs pay_employee itself. The admin's wallet signs no transaction for that, so no wallet delay can invalidate it.
//
// The helper is derived from the wallet's own confidential keys (so the same wallet always gets the same helper, and any SOL left
// in it is recoverable), holds only a few thousandths of a SOL, and is never persisted or sent anywhere.
import { address, createKeyPairSignerFromPrivateKeyBytes, type Address, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import { findVaultPda } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import type { WalletSignMessage } from "@/lib/crypto/keys";
import { getTransferSolInstruction } from "@solana-program/system";
import type { DerivedKeys } from "@/lib/crypto/keys";
import type { AppRpc } from "./rpc";
import { buildAuthorization, NO_OPERATOR } from "./authorization";
import { readOperator, type OperatorTerms } from "./operator";
import { signAndSend, type SignAndSendOptions } from "./send";

/**
 * What the helper needs on hand: rent for the three proof accounts per payment (about 0.0063 SOL on devnet, 0.0086 on a
 * surfpool fork, refunded when they close), the one-off rent for the `OperatorConfig` account it creates when it is first
 * authorized (about 0.002 SOL, not refunded), and fees. Deliberately generous: topping the helper up is the only thing the
 * admin's wallet still signs as a transaction, so the rarer it is, the better.
 */
export const HELPER_MIN_LAMPORTS = 15_000_000n;
/** What the helper is topped up to. */
export const HELPER_TOPUP_LAMPORTS = 22_000_000n;
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

/**
 * Tops the helper up from the admin's wallet if it is short. This is the ONE thing left that the admin's wallet signs as a
 * transaction, so it is deadline-bound like any other; it only happens when the helper is actually low, which is rare now that
 * the helper is not swept after every run. Returns true if it asked the wallet.
 */
export async function topUpHelperIfShort(input: { rpc: AppRpc; admin: TransactionSigner; helper: KeyPairSigner; onPrompt?: SignAndSendOptions["onPrompt"]; onSigned?: () => void; onNeedTopUp?: (lamports: bigint) => void }): Promise<boolean> {
  const { rpc, admin, helper, onPrompt, onSigned, onNeedTopUp } = input;
  const balance = await balanceOf(rpc, helper);
  if (balance >= HELPER_MIN_LAMPORTS) return false;
  const amount = HELPER_TOPUP_LAMPORTS - balance;
  onNeedTopUp?.(amount);
  await signAndSend({ rpc, signer: admin, instructions: [getTransferSolInstruction({ source: admin, destination: helper.address, amount })], onPrompt, onSigned });
  return true;
}

/**
 * Authorizes the helper as the vault's operator, or revokes it, from a message the admin signs. No transaction deadline applies
 * to the admin: they can take as long as their wallet needs. The helper signs and pays for the transaction itself.
 */
export async function authorizeHelper(input: { rpc: AppRpc; admin: Address; helper: KeyPairSigner; signMessage: WalletSignMessage; terms?: OperatorTerms }): Promise<void> {
  const { rpc, admin, helper, signMessage, terms } = input;
  const [vault] = await findVaultPda({ admin, mint: address(DEVNET_WUSDC_MINT) });
  // The sequence must be the config's current one, so read it as late as possible.
  const { seq } = await readOperator(rpc, admin, helper.address);
  const instructions = await buildAuthorization({
    admin,
    payer: helper,
    signMessage,
    terms: terms
      ? { vault, operator: helper.address, expiresAt: BigInt(Math.floor(Date.now() / 1000) + terms.ttlSeconds), maxPayments: terms.maxPayments, seq }
      : { vault, operator: NO_OPERATOR, expiresAt: 0n, maxPayments: 0, seq },
  });
  await signAndSend({ rpc, signer: helper, instructions });
}

/** What the helper holds now, in lamports. */
export const helperBalance = balanceOf;

/** Returns whatever the helper holds to the admin. Needs no wallet approval. Best-effort: a failure just leaves the SOL for next time. */
export async function sweepHelper(input: { rpc: AppRpc; admin: TransactionSigner; helper: KeyPairSigner }): Promise<bigint> {
  const { rpc, admin, helper } = input;
  const balance = await balanceOf(rpc, helper);
  if (balance <= FEE_LAMPORTS * 2n) return 0n;
  const amount = balance - FEE_LAMPORTS;
  await signAndSend({ rpc, signer: helper, instructions: [getTransferSolInstruction({ source: helper, destination: admin.address, amount })] });
  return amount;
}

/** Ends the authorization (the admin signs a message, not a transaction), then returns the helper's SOL. Returns the lamports returned. */
export async function revokeAndReclaim(input: { rpc: AppRpc; admin: TransactionSigner; helper: KeyPairSigner; signMessage: WalletSignMessage }): Promise<bigint> {
  const { rpc, admin, helper, signMessage } = input;
  await authorizeHelper({ rpc, admin: address(admin.address), helper, signMessage });
  return sweepHelper({ rpc, admin, helper }).catch(() => 0n);
}
