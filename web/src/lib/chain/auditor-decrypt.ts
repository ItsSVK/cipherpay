// CLIENT-ONLY. The auditor's read path: find a vault's pay_employee transactions on-chain, pull the auditor ciphertexts out of each
// instruction, and open them with the auditor's ElGamal secret. The secret is never stored or sent anywhere; decryption runs in the proof
// worker (lib/crypto/proof-client.ts, `openAmountsWithSecret`).
//
// Why instruction data and not the event: logs can truncate, and Token-2022 requires the instruction's auditor ciphertexts to match the
// ciphertext-validity proof, so they are the amount that really moved. Each half is a full 64-byte ElGamal ciphertext (32-byte Pedersen
// commitment + 32-byte auditor decrypt handle); the amount is `lo + hi * 2^16`.
import { address, getAddressDecoder, getBase58Encoder, type Address, type Signature } from "@solana/kit";
import { fetchAllMaybeToken } from "@solana-program/token-2022";
import { getPayEmployeeInstructionDataDecoder, PAY_EMPLOYEE_DISCRIMINATOR } from "@/generated/vault/src/generated";
import { encodeReceivedAmount } from "@/lib/received-amount";
import { openAmountsWithSecret } from "@/lib/crypto/proof-client";
import { VAULT_PROGRAM_ADDRESS } from "./constants";
import type { AppRpc } from "./rpc";

/** Positions in pay_employee's accounts (the generated builder's order). */
const SIGNER_INDEX = 0;
const VAULT_INDEX = 1;
const EMPLOYEE_TOKEN_ACCOUNT_INDEX = 4;
const SECRET_BYTES = 32;
const TX_CONCURRENCY = 3;

export interface AuditorPayment {
  signature: string;
  /** Unix seconds, or null if the node doesn't know it. */
  blockTime: number | null;
  /** Who signed pay_employee: the vault admin, or its payroll operator. */
  signer: Address;
  /** The recipient's confidential token account. */
  employeeTokenAccount: Address;
  /** The two 64-byte auditor ciphertexts, as carried by the instruction. */
  lo: Uint8Array;
  hi: Uint8Array;
}

/** An instruction with its account addresses resolved, the shape the pure extractor works on. */
export interface ResolvedInstruction {
  programAddress: Address;
  accounts: Address[];
  data: Uint8Array;
}

const startsWith = (data: Uint8Array, prefix: ArrayLike<number>) => data.length >= prefix.length && Array.from(prefix).every((b, i) => data[i] === b);

/** Pure part, for tests: every pay_employee of `vault` in these instructions, with its auditor ciphertexts. Anything else is skipped. */
export function extractPayEmployee(instructions: ResolvedInstruction[], vault: Address): Omit<AuditorPayment, "signature" | "blockTime">[] {
  const out: Omit<AuditorPayment, "signature" | "blockTime">[] = [];
  for (const ix of instructions) {
    if (ix.programAddress !== VAULT_PROGRAM_ADDRESS || !startsWith(ix.data, PAY_EMPLOYEE_DISCRIMINATOR)) continue;
    if (ix.accounts[VAULT_INDEX] !== vault) continue;
    try {
      const args = getPayEmployeeInstructionDataDecoder().decode(ix.data);
      out.push({
        signer: ix.accounts[SIGNER_INDEX],
        employeeTokenAccount: ix.accounts[EMPLOYEE_TOKEN_ACCOUNT_INDEX],
        lo: Uint8Array.from(args.transferAmountAuditorCiphertextLo),
        hi: Uint8Array.from(args.transferAmountAuditorCiphertextHi),
      });
    } catch {
      // Malformed data cannot be a payment the program accepted; skip it rather than fail the whole page.
    }
  }
  return out;
}

/**
 * Reads a pasted auditor secret: 32 bytes as base64, hex, or a JSON array of numbers. Null if it is none of those. This only checks the
 * shape; whether it is the mint's auditor key is `checkAuditorSecret`.
 */
export function parseAuditorSecret(input: string): Uint8Array | null {
  const text = input.trim();
  if (!text) return null;
  let bytes: Uint8Array | null = null;
  if (text.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(text);
      if (Array.isArray(arr) && arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) bytes = Uint8Array.from(arr as number[]);
    } catch {
      return null;
    }
  } else if (/^[0-9a-fA-F]{64}$/.test(text)) {
    bytes = Uint8Array.from(text.match(/../g)!.map((h) => parseInt(h, 16)));
  } else if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(text)) {
    try {
      bytes = Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return bytes && bytes.length === SECRET_BYTES ? bytes : null;
}

/** The ElGamal public key (as an address, the form the mint reports it in) that belongs to this secret. */
export async function auditorPubkeyForSecret(secret: Uint8Array): Promise<Address> {
  const { ElGamalPubkey, ElGamalSecretKey } = await import("@solana/zk-sdk/bundler");
  const sk = ElGamalSecretKey.fromBytes(secret);
  const pk = ElGamalPubkey.fromSecretKey(sk);
  try {
    return getAddressDecoder().decode(pk.toBytes());
  } finally {
    pk.free();
    sk.free();
  }
}

/** True when this secret is the one behind the mint's registered auditor key (`mintAuditor`, from readAuditorPubkey). */
export async function checkAuditorSecret(secret: Uint8Array, mintAuditor: Address): Promise<boolean> {
  return (await auditorPubkeyForSecret(secret)) === mintAuditor;
}

export interface AuditorPage {
  payments: AuditorPayment[];
  /** Pass as `before` to read the next (older) page; null when the vault has no older transactions. */
  nextBefore: string | null;
  /** How many transactions were looked at (including ones that were not payments). */
  scanned: number;
}

async function inPool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

/**
 * One page of the vault's history, newest first: every successful pay_employee in the last `limit` transactions that touched the vault
 * (app-made or not). Throws if the RPC can't answer; a transaction the node no longer has is skipped.
 */
export async function fetchAuditorPayments(rpc: AppRpc, vault: Address, opts: { before?: string; limit?: number } = {}): Promise<AuditorPage> {
  const limit = opts.limit ?? 50;
  const sigs = await rpc.getSignaturesForAddress(vault, { limit, before: opts.before as Signature | undefined, commitment: "confirmed" }).send();
  const b58 = getBase58Encoder();
  const perTx = await inPool(
    sigs.filter((s) => s.err === null),
    TX_CONCURRENCY,
    async (s): Promise<AuditorPayment[]> => {
      const tx = await rpc.getTransaction(s.signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send();
      if (!tx || tx.meta?.err) return [];
      const keys: Address[] = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])].map((k) => address(k));
      const instructions = tx.transaction.message.instructions.map((ix) => ({
        programAddress: keys[ix.programIdIndex],
        accounts: ix.accounts.map((i) => keys[i]),
        data: Uint8Array.from(b58.encode(ix.data)),
      }));
      const blockTime = tx.blockTime === null || tx.blockTime === undefined ? null : Number(tx.blockTime);
      return extractPayEmployee(instructions, vault).map((p) => ({ ...p, signature: s.signature, blockTime }));
    },
  );
  return {
    payments: perTx.flat(),
    nextBefore: sigs.length === limit ? sigs[sigs.length - 1].signature : null,
    scanned: sigs.length,
  };
}

/** One amount per payment, in order; null where it does not open under this key (not encrypted to it, or not a valid amount). */
export function openAuditorPayments(payments: readonly AuditorPayment[], secret: Uint8Array): Promise<(bigint | null)[]> {
  return openAmountsWithSecret(
    payments.map((p) => encodeReceivedAmount(p.lo, p.hi)),
    secret,
  );
}

/** The wallet that owns each recipient token account, where the chain can say (best effort: a failure just leaves the account address). */
export async function resolveTokenOwners(rpc: AppRpc, tokenAccounts: readonly Address[]): Promise<Record<string, Address>> {
  const unique = [...new Set(tokenAccounts)];
  if (unique.length === 0) return {};
  try {
    const accounts = await fetchAllMaybeToken(rpc, unique, { commitment: "confirmed" });
    return Object.fromEntries(accounts.flatMap((a) => (a.exists ? [[a.address, a.data.owner] as const] : [])));
  } catch {
    return {};
  }
}
