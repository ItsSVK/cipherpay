// The wire format of a payment's amount as encrypted FOR THE RECIPIENT. Shared by the client (which stores and opens it) and the server
// (which only checks the shape and stores it). No keys here, and nothing that can decrypt: that is lib/chain/received-amount-local.ts.
//
// Where it comes from: a confidential Transfer encrypts the amount's low 16 bits and high bits once for each of the source, the destination
// and the auditor, all sharing one Pedersen commitment per half. The destination's two ciphertexts are what Token-2022 adds to the
// recipient's pending balance. The admin's browser already computes them while proving the payment (transfer-proofs.ts), so it keeps them
// and saves them with the run. They are public on-chain anyway (inside the ciphertext-validity proof), so storing them reveals nothing.

/** `v1.` + base64url (no padding) of lo (64) || hi (64), each a 32-byte commitment || 32-byte decrypt handle: 128 bytes = 171 characters. */
export const RECEIVED_AMOUNT_PATTERN = /^v1\.[A-Za-z0-9_-]{171}$/;

const CT_BYTES = 64;

const toB64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function encodeReceivedAmount(lo: Uint8Array, hi: Uint8Array): string {
  if (lo.length !== CT_BYTES || hi.length !== CT_BYTES) throw new Error("A received-amount ciphertext must be two 64-byte ElGamal ciphertexts.");
  const out = new Uint8Array(CT_BYTES * 2);
  out.set(lo, 0);
  out.set(hi, CT_BYTES);
  return `v1.${toB64Url(out)}`;
}

/** Null for anything that is not a well-formed received amount (so a bad row shows as private instead of failing the page). */
export function decodeReceivedAmount(encoded: string | null | undefined): { lo: Uint8Array; hi: Uint8Array } | null {
  if (!encoded || !RECEIVED_AMOUNT_PATTERN.test(encoded)) return null;
  const bin = atob(encoded.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return { lo: bytes.slice(0, CT_BYTES), hi: bytes.slice(CT_BYTES) };
}
