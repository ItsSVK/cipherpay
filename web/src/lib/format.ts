import { TOKEN_DECIMALS } from "@/lib/chain/constants";

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);

/** Base units (bigint) -> "1,234.50". Display edge only; never feed the result back into math. */
export function formatUsdc(base: bigint, minFraction = 2): string {
  const negative = base < 0n;
  const abs = negative ? -base : base;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  const fraction = frac.padEnd(minFraction, "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${fraction ? `.${fraction}` : ""}`;
}

/** "1,234.5" -> base units. Returns null for anything that is not a plain decimal. */
export function parseUsdc(input: string): bigint | null {
  const clean = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(TOKEN_DECIMALS, "0"));
}

export function shortAddress(address: string, head = 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * How a real ciphertext looks on screen while encrypted: `0x` + its first 5 hex digits. A fixed shape, so it says nothing about the
 * value's size and cannot be mistaken for a number. Undefined when there are no bytes.
 */
export function cipherPreview(bytes: ArrayLike<number> | null | undefined): string | undefined {
  if (!bytes || bytes.length < 3) return undefined;
  return `0x${Array.from(bytes).slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("").slice(0, 5)}`;
}

/** Small deterministic string hash (FNV-1a), for stable ciphertext and fingerprints in the UI. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) so ciphertext looks random but never changes between renders. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
