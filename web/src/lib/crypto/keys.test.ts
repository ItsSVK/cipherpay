import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import { deriveWalletKeys, KeyDerivationError, toMessagePartialSigner, type WalletSignMessage } from "./keys";

// A software wallet: signs exactly the bytes it is given, like a well-behaved wallet-standard wallet.
async function softWallet() {
  const kp = await generateKeyPairSigner();
  const signMessage: WalletSignMessage = async (message) => {
    const [dict] = await kp.signMessages([{ content: message, signatures: {} }]);
    return { signature: dict[kp.address] as unknown as Uint8Array, signedMessage: message };
  };
  return { address: kp.address, signMessage };
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("wallet key derivation", () => {
  test("the same wallet derives the same keys every time", async () => {
    const w = await softWallet();
    const a = await deriveWalletKeys(toMessagePartialSigner(w.address, w.signMessage));
    const b = await deriveWalletKeys(toMessagePartialSigner(w.address, w.signMessage));
    expect(a.elgamalKeypair.elgamalPubkey).toBe(b.elgamalKeypair.elgamalPubkey);
    expect(hex(a.aeKey)).toBe(hex(b.aeKey));
    expect(hex(a.elgamalKeypair.secretKey)).toBe(hex(b.elgamalKeypair.secretKey));
  });

  test("different wallets derive different keys", async () => {
    const w1 = await softWallet();
    const w2 = await softWallet();
    const a = await deriveWalletKeys(toMessagePartialSigner(w1.address, w1.signMessage));
    const b = await deriveWalletKeys(toMessagePartialSigner(w2.address, w2.signMessage));
    expect(a.elgamalKeypair.elgamalPubkey).not.toBe(b.elgamalKeypair.elgamalPubkey);
  });

  test("a wallet that rewrites the message is rejected", async () => {
    const w = await softWallet();
    const rewriting: WalletSignMessage = async (message) => {
      const prefixed = new Uint8Array([...new TextEncoder().encode("Sign: "), ...message]);
      return { ...(await w.signMessage(prefixed)), signedMessage: prefixed };
    };
    await expect(deriveWalletKeys(toMessagePartialSigner(w.address, rewriting))).rejects.toBeInstanceOf(KeyDerivationError);
  });

  test("a rejected prompt surfaces as a wallet error", async () => {
    const w = await softWallet();
    const rejecting: WalletSignMessage = async () => { throw new Error("User rejected the request."); };
    await expect(deriveWalletKeys(toMessagePartialSigner(w.address, rejecting))).rejects.toMatchObject({ kind: "wallet" });
  });
});
