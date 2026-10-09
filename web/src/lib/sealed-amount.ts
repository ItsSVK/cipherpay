// The wire format of an amount the admin's browser has encrypted for itself, and what each ciphertext is bound to.
// Shared by the client (which seals and opens) and the server (which only checks the shape and stores it). No keys here,
// and nothing that can decrypt: that lives in lib/crypto/record-seal.ts, which the server must never import.

/**
 * `v1.` + base64url (no padding) of nonce (12) || AES-GCM ciphertext of a u64 little-endian (8) || tag (16) = 36 bytes
 * = 48 characters. Every sealed amount has the same length, so the length says nothing about the value.
 */
export const SEALED_AMOUNT_PATTERN = /^v1\.[A-Za-z0-9_-]{48}$/;

const PREVIEW_DIGITS = 5;

/**
 * How a sealed amount looks on screen while it is encrypted: `0x` + the first 5 hex digits of its AES-GCM ciphertext bytes
 * (after the nonce), 7 characters, the same shape as the treasury's on-chain ciphertext. Undefined when there is no sealed value.
 */
export function sealedPreview(sealed: string | null | undefined): string | undefined {
  if (!sealed || !SEALED_AMOUNT_PATTERN.test(sealed)) return undefined;
  const bytes = atob(sealed.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
  const ct = Array.from(bytes.slice(12, 20), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return `0x${ct.slice(0, PREVIEW_DIGITS)}`;
}

/**
 * A total has no sealed value of its own (only each line is saved encrypted), so it is shown as a digest of the sealed lines
 * it adds up: it changes whenever any of them does. Undefined unless every line is sealed.
 */
export function sealedTotalPreview(sealed: readonly (string | null | undefined)[]): string | undefined {
  if (sealed.length === 0 || sealed.some((s) => !s || !SEALED_AMOUNT_PATTERN.test(s))) return undefined;
  let h = 0x811c9dc5;
  for (const ch of sealed.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return `0x${(h >>> 0).toString(16).padStart(8, "0").slice(0, PREVIEW_DIGITS)}`;
}

/**
 * The associated data each ciphertext is bound to. AES-GCM refuses to open a ciphertext under different associated data,
 * so whoever holds the database can't move an amount to another row (swap two people's pay, or reuse one payroll's figure
 * in another) without the browser noticing.
 */
export const amountContext = {
  payrollEntry: (employer: string, payrollId: string, addressId: string) => `cipherpay/amount/v1|${employer}|payroll|${payrollId}|${addressId}`,
  runTotal: (employer: string, runId: string) => `cipherpay/amount/v1|${employer}|run|${runId}|total`,
  runItem: (employer: string, runId: string, wallet: string) => `cipherpay/amount/v1|${employer}|run|${runId}|item|${wallet}`,
};
