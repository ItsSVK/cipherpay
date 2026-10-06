// The offline-signed operator authorization.
//
// Why it exists: a transaction is only valid for ~150 blocks (about 40 seconds on devnet). A browser wallet simulates what it is
// asked to sign against its OWN RPC, and when that RPC is slow or rate-limited the popup can take longer than the whole window, so
// the admin ends up approving something already dead. A SIGNED MESSAGE has no expiry and nothing to simulate, so the admin can take
// as long as they like. The payroll helper then builds, signs and pays for the transaction that carries it.
//
// The admin's wallet therefore never signs a transaction to turn automatic payroll on or off.
import { address, getAddressEncoder, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { getAuthorizeOperatorInstructionAsync } from "@/generated/vault/src/generated";
import type { WalletSignMessage } from "@/lib/crypto/keys";

const ED25519_PROGRAM = address("Ed25519SigVerify111111111111111111111111111");
/** The address the program reads as "no operator". */
export const NO_OPERATOR = address("11111111111111111111111111111111");

export interface AuthorizationTerms {
  vault: Address;
  /** `NO_OPERATOR` revokes. */
  operator: Address;
  expiresAt: bigint;
  maxPayments: number;
  /** The operator config's current replay counter, which makes this message usable exactly once. */
  seq: bigint;
}

/**
 * The exact text the admin signs, and what their wallet shows them.
 *
 * **This must match `authorization_message` in `programs/vault/src/instructions/authorize_operator.rs` byte for byte.** The
 * program rebuilds it from the instruction's arguments and compares, so one different character means the authorization is
 * refused (which is exactly what stops anyone altering the terms after the admin has signed).
 */
export function authorizationMessage({ vault, operator, expiresAt, maxPayments, seq }: AuthorizationTerms): string {
  if (operator === NO_OPERATOR) return `Cipherpay: revoke payroll operator\nvault: ${vault}\nseq: ${seq}`;
  return `Cipherpay: authorize payroll operator\nvault: ${vault}\noperator: ${operator}\nexpires: ${expiresAt}\npayments: ${maxPayments}\nseq: ${seq}`;
}

/**
 * Solana's Ed25519 precompile instruction. The runtime verifies the signature itself; if it is wrong the whole transaction fails
 * before our program runs.
 *
 * Layout: `[count=1, padding, 14 bytes of offsets, pubkey(32), signature(64), message]`. The three "instruction index" fields are
 * `0xFFFF`, meaning "this instruction", so the bytes the runtime checks are the bytes our program reads.
 */
export function ed25519VerifyInstruction(signer: Address, message: Uint8Array, signature: Uint8Array): Instruction {
  if (signature.length !== 64) throw new Error(`An Ed25519 signature must be 64 bytes, got ${signature.length}.`);
  const PUBLIC_KEY_OFFSET = 16;
  const SIGNATURE_OFFSET = 48;
  const MESSAGE_OFFSET = 112;
  const SELF = 0xffff;

  const data = new Uint8Array(MESSAGE_OFFSET + message.length);
  const view = new DataView(data.buffer);
  data[0] = 1; // exactly one signature
  data[1] = 0; // padding
  view.setUint16(2, SIGNATURE_OFFSET, true);
  view.setUint16(4, SELF, true);
  view.setUint16(6, PUBLIC_KEY_OFFSET, true);
  view.setUint16(8, SELF, true);
  view.setUint16(10, MESSAGE_OFFSET, true);
  view.setUint16(12, message.length, true);
  view.setUint16(14, SELF, true);
  data.set(getAddressEncoder().encode(signer), PUBLIC_KEY_OFFSET);
  data.set(signature, SIGNATURE_OFFSET);
  data.set(message, MESSAGE_OFFSET);

  return { programAddress: ED25519_PROGRAM, data };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * Asks the admin's wallet to sign the authorization text, then returns the two instructions that carry it:
 * `[Ed25519 verify, authorize_operator]`, in that order (the program reads the instruction immediately before its own).
 * `payer` signs and pays for the transaction, so the admin's wallet signs no transaction at all.
 */
export async function buildAuthorization(input: { admin: Address; payer: TransactionSigner; terms: AuthorizationTerms; signMessage: WalletSignMessage }): Promise<Instruction[]> {
  const { admin, payer, terms, signMessage } = input;
  const message = new TextEncoder().encode(authorizationMessage(terms));
  const { signature, signedMessage } = await signMessage(message);
  // A wallet that alters the message would produce a signature over something else, which the program would refuse with an
  // error that says nothing useful. Catch it here instead.
  if (!sameBytes(signedMessage, message)) throw new Error("Your wallet changed the authorization text before signing it, so the signature can't be used. Try a different wallet.");

  return [
    ed25519VerifyInstruction(admin, message, signature),
    await getAuthorizeOperatorInstructionAsync({
      payer,
      vault: terms.vault,
      operator: terms.operator,
      expiresAt: terms.expiresAt,
      maxPayments: terms.maxPayments,
      seq: terms.seq,
    }),
  ];
}
