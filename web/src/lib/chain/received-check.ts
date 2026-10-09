// Checks a payment amount the employer's record says it sent (lib/received-amount.ts) against the real pay_employee transaction.
//
// Why this is enough: Token-2022 requires pay_employee's auditor ciphertexts to match the ciphertext-validity proof, and in that proof the
// auditor's and the recipient's ciphertexts share the same Pedersen commitment per half (only the decrypt handle differs). So if the stored
// recipient ciphertexts carry the commitments the transaction carries, they encrypt the amount that was actually transferred: a handle that
// pairs a real commitment with a different value would need a discrete-log relation nobody knows, and it simply would not decrypt.
import { address, getBase58Encoder, type Address, type Signature } from "@solana/kit";
import { getPayEmployeeInstructionDataDecoder, PAY_EMPLOYEE_DISCRIMINATOR } from "@/generated/vault/src/generated";
import { decodeReceivedAmount } from "@/lib/received-amount";
import { VAULT_PROGRAM_ADDRESS } from "./constants";
import type { AppRpc } from "./rpc";

/** `match`: the stored amount is the one transferred to this account. `mismatch`: it is not (or the transaction is not such a payment). `unavailable`: the chain could not be asked. */
export type ReceivedCheck = "match" | "mismatch" | "unavailable";

/** Position of employee_token_account in pay_employee's accounts (the generated builder's order). */
const EMPLOYEE_TOKEN_ACCOUNT_INDEX = 4;
const COMMITMENT_BYTES = 32;

const sameBytes = (a: Uint8Array | ArrayLike<number>, b: Uint8Array | ArrayLike<number>, n: number) => {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};
const startsWith = (data: Uint8Array, prefix: ArrayLike<number>) => data.length >= prefix.length && sameBytes(data, prefix, prefix.length);

/** Pure part, for tests: does any of these pay_employee instructions pay `tokenAccount` the amount behind `received`? */
export function receivedMatchesInstructions(instructions: { programAddress: Address; accounts: Address[]; data: Uint8Array }[], tokenAccount: Address, received: string): boolean {
  const parts = decodeReceivedAmount(received);
  if (!parts) return false;
  return instructions.some((ix) => {
    if (ix.programAddress !== VAULT_PROGRAM_ADDRESS || !startsWith(ix.data, PAY_EMPLOYEE_DISCRIMINATOR)) return false;
    if (ix.accounts[EMPLOYEE_TOKEN_ACCOUNT_INDEX] !== tokenAccount) return false;
    let args;
    try {
      args = getPayEmployeeInstructionDataDecoder().decode(ix.data);
    } catch {
      return false;
    }
    return sameBytes(args.transferAmountAuditorCiphertextLo, parts.lo, COMMITMENT_BYTES) && sameBytes(args.transferAmountAuditorCiphertextHi, parts.hi, COMMITMENT_BYTES);
  });
}

export async function checkReceivedAgainstChain(rpc: AppRpc, signature: string, tokenAccount: Address, received: string): Promise<ReceivedCheck> {
  let tx;
  try {
    tx = await rpc.getTransaction(signature as Signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send();
  } catch {
    return "unavailable";
  }
  // Not found yet (or pruned by the node): we can't say either way.
  if (!tx) return "unavailable";
  if (tx.meta?.err) return "mismatch";
  const keys: Address[] = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])].map((k) => address(k));
  const b58 = getBase58Encoder();
  const instructions = tx.transaction.message.instructions.map((ix) => ({
    programAddress: keys[ix.programIdIndex],
    accounts: ix.accounts.map((i) => keys[i]),
    data: Uint8Array.from(b58.encode(ix.data)),
  }));
  return receivedMatchesInstructions(instructions, tokenAccount, received) ? "match" : "mismatch";
}
