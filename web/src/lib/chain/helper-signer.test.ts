import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { deriveHelperSigner, HELPER_MIN_LAMPORTS, HELPER_TOPUP_LAMPORTS } from "./helper-signer";

async function keysFor(kp: Awaited<ReturnType<typeof generateKeyPairSigner>>) {
  const sign: WalletSignMessage = async (message) => {
    const [d] = await kp.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[kp.address] as unknown as Uint8Array, signedMessage: message };
  };
  return deriveWalletKeys(toMessagePartialSigner(kp.address, sign));
}

describe("payroll helper key", () => {
  test("the same wallet always gets the same helper (so leftover SOL is always recoverable)", async () => {
    const kp = await generateKeyPairSigner();
    const a = await deriveHelperSigner(await keysFor(kp));
    const b = await deriveHelperSigner(await keysFor(kp));
    expect(a.address).toBe(b.address);
  }, 30_000);

  test("different wallets get different helpers, and the helper is never the wallet itself", async () => {
    const k1 = await generateKeyPairSigner();
    const k2 = await generateKeyPairSigner();
    const h1 = await deriveHelperSigner(await keysFor(k1));
    const h2 = await deriveHelperSigner(await keysFor(k2));
    expect(h1.address).not.toBe(h2.address);
    expect(h1.address).not.toBe(k1.address);
  }, 30_000);

  test("it can actually sign (a usable keypair signer)", async () => {
    const kp = await generateKeyPairSigner();
    const h = await deriveHelperSigner(await keysFor(kp));
    const [sig] = await h.signMessages([{ content: new TextEncoder().encode("x"), signatures: {} }]);
    expect(sig[h.address]).toBeDefined();
  }, 30_000);

  test("the funding threshold is above the proof accounts' rent (proof accounts plus the operator config's own rent) and the top-up is above the threshold", () => {
    expect(HELPER_MIN_LAMPORTS).toBeGreaterThan(10_600_000n);
    expect(HELPER_TOPUP_LAMPORTS).toBeGreaterThan(HELPER_MIN_LAMPORTS);
  });
});
