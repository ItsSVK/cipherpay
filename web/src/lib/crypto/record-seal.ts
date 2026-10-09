// CLIENT-ONLY. Encrypts the amounts the admin saves off-chain (payroll templates, run history) so the server stores only
// ciphertext. Never import this from server code. The key is derived in the browser and never leaves it.
import type { DerivedKeys } from "@/lib/crypto/keys";
import { SEALED_AMOUNT_PATTERN } from "@/lib/sealed-amount";

const HKDF_SALT = new TextEncoder().encode("cipherpay/record-key");
const HKDF_INFO = new TextEncoder().encode("cipherpay/payroll-amounts/v1");
const NONCE_BYTES = 12;
const MAX_U64 = 2n ** 64n - 1n;

export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

/**
 * A separate AES-256-GCM key for off-chain records, derived (HKDF-SHA256) from the wallet's ElGamal secret. It comes from
 * the same one wallet signature as every other key, so it is the same in every session, but it is never the key Token-2022
 * uses for balances: one key, one job. Not extractable, so even this tab's own code can't read its bytes back.
 */
export async function deriveRecordKey(elgamalSecret: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", elgamalSecret as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// One derivation per unlocked key set. Weak, so it goes away with the keys once they are locked and dropped.
const cache = new WeakMap<DerivedKeys, Promise<CryptoKey>>();
export function recordKeyFor(keys: DerivedKeys): Promise<CryptoKey> {
  let key = cache.get(keys);
  if (!key) {
    key = deriveRecordKey(keys.elgamalKeypair.secretKey);
    cache.set(keys, key);
  }
  return key;
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Encrypts a base-unit amount, bound to `context` (see `amountContext`). Output matches `SEALED_AMOUNT_PATTERN`. */
export async function sealAmount(key: CryptoKey, amount: bigint, context: string): Promise<string> {
  if (amount < 0n || amount > MAX_U64) throw new SealError("Amount does not fit in a u64.");
  const plain = new Uint8Array(8);
  new DataView(plain.buffer).setBigUint64(0, amount, true);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(context) }, key, plain));
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce);
  out.set(ct, NONCE_BYTES);
  return `v1.${toBase64Url(out)}`;
}

/**
 * Decrypts what `sealAmount` produced. Throws `SealError` if the value was made with another key, was changed, or was moved
 * to a different row (different `context`): a tampered amount is never returned as a number.
 */
export async function openAmount(key: CryptoKey, sealed: string, context: string): Promise<bigint> {
  if (!SEALED_AMOUNT_PATTERN.test(sealed)) throw new SealError("Not a sealed amount.");
  const bytes = fromBase64Url(sealed.slice(3));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, NONCE_BYTES), additionalData: new TextEncoder().encode(context) }, key, bytes.subarray(NONCE_BYTES));
  } catch {
    throw new SealError("This amount can't be decrypted with this wallet's keys, or it was changed after it was saved.");
  }
  return new DataView(plain).getBigUint64(0, true);
}
