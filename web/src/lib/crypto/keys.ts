// CLIENT-ONLY. Derives the confidential-transfer keys from a wallet signature. Never import this from
// server code, and never persist or transmit anything it returns except the public ElGamal key.
import type { Address, MessagePartialSigner, SignatureBytes } from "@solana/kit";

/** What the wallet hands back for a signMessage request (wallet-standard `solana:signMessage`). */
export type WalletSignMessage = (message: Uint8Array) => Promise<{ signature: Uint8Array; signedMessage: Uint8Array }>;

export interface DerivedKeys {
  /** AES-128 key that decrypts the wallet's own available-balance ciphertext. */
  aeKey: Uint8Array;
  elgamalKeypair: { elgamalPubkey: Address; secretKey: Uint8Array };
}

export class KeyDerivationError extends Error {
  constructor(
    message: string,
    readonly kind: "modified-message" | "wallet",
  ) {
    super(message);
    this.name = "KeyDerivationError";
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Adapts a wallet-standard signMessage to the kit signer the derivation helper wants. Key derivation
 * needs the signature over *exactly* these bytes, so a wallet that rewrites the message (some do, to add
 * a prefix) must be rejected rather than silently producing keys nobody else can reproduce.
 */
export function toMessagePartialSigner(address: string, signMessage: WalletSignMessage): MessagePartialSigner {
  return {
    address: address as Address,
    async signMessages(messages) {
      const out: Record<string, SignatureBytes>[] = [];
      for (const m of messages) {
        let signed;
        try {
          signed = await signMessage(m.content);
        } catch (e) {
          throw new KeyDerivationError(e instanceof Error ? e.message : "The wallet did not sign the message.", "wallet");
        }
        if (!sameBytes(signed.signedMessage, m.content)) {
          throw new KeyDerivationError("This wallet changed the message before signing, so keys derived from it would not match what other tools derive. Try a different wallet.", "modified-message");
        }
        out.push({ [address]: signed.signature as SignatureBytes });
      }
      return out;
    },
  };
}

/**
 * The standard wallet-level derivation from @solana-program/token-2022: the wallet signs the constant
 * `solana-conf-bal/v1` once, and both the ElGamal keypair and the AES key come from that one signature.
 * The WASM (@solana/zk-sdk) is loaded lazily here so it only ever loads in the browser, on demand.
 */
export async function deriveWalletKeys(signer: MessagePartialSigner): Promise<DerivedKeys> {
  const { deriveConfidentialKeys } = await import("@solana-program/token-2022/confidential");
  return deriveConfidentialKeys({ signer });
}

/** Best-effort wipe of key bytes when they are no longer needed. */
export function wipeKeys(keys: DerivedKeys | null): void {
  keys?.aeKey.fill(0);
  keys?.elgamalKeypair.secretKey.fill(0);
}

const PUBKEY_STORAGE_PREFIX = "cipherpay:elgamal-pubkey:";

/**
 * The same wallet must derive the same keys every time. We remember the *public* ElGamal key per wallet
 * (public data, safe to store) so a wallet that signs non-deterministically is noticed on the second
 * session instead of silently stranding balances encrypted under the first key.
 */
export function checkKeyContinuity(address: string, elgamalPubkey: string): "first-time" | "same" | "changed" {
  try {
    const key = PUBKEY_STORAGE_PREFIX + address;
    const prev = window.localStorage.getItem(key);
    if (prev === null) {
      window.localStorage.setItem(key, elgamalPubkey);
      return "first-time";
    }
    return prev === elgamalPubkey ? "same" : "changed";
  } catch {
    return "first-time";
  }
}

/** A short, human message for a failed derivation. */
export function describeDerivationError(e: unknown): string {
  if (e instanceof KeyDerivationError) return e.message;
  return e instanceof Error ? e.message : "Key derivation failed.";
}
