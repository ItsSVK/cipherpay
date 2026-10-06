// Pure signature check (WebCrypto Ed25519, available on Workers, Node 20+ and Bun). No database here, so it is testable.
import { getPublicKeyFromAddress, isAddress, verifySignature, signatureBytes, address } from "@solana/kit";

/** True only if `signature` is the wallet's valid Ed25519 signature over exactly `message`. Never throws on bad input. */
export async function verifyWalletSignature(walletAddress: string, message: string, signature: Uint8Array): Promise<boolean> {
  try {
    if (!isAddress(walletAddress) || signature.length !== 64) return false;
    const key = await getPublicKeyFromAddress(address(walletAddress));
    return await verifySignature(key, signatureBytes(signature), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}
