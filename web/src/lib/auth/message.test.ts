import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import { buildSignInMessage, SIGN_IN_TTL_SECONDS } from "./message";
import { verifyWalletSignature } from "./verify";

const fields = (address: string) => ({ domain: "app.example.com", address, nonce: "abc123", issuedAt: 1_800_000_000, expiresAt: 1_800_000_000 + SIGN_IN_TTL_SECONDS });

async function signed(message: string) {
  const kp = await generateKeyPairSigner();
  const [dict] = await kp.signMessages([{ content: new TextEncoder().encode(message), signatures: {} }]);
  return { kp, signature: dict[kp.address] as unknown as Uint8Array };
}

describe("sign-in message and verification", () => {
  test("the message names the site, the wallet and the nonce", () => {
    const m = buildSignInMessage(fields("WalletAddr111"));
    expect(m).toContain("app.example.com wants you to sign in");
    expect(m).toContain("WalletAddr111");
    expect(m).toContain("Nonce: abc123");
    expect(m).toContain("Expiration Time: ");
  });

  test("a wallet's own signature over the exact message verifies", async () => {
    const kp = await generateKeyPairSigner();
    const message = buildSignInMessage(fields(kp.address));
    const [dict] = await kp.signMessages([{ content: new TextEncoder().encode(message), signatures: {} }]);
    expect(await verifyWalletSignature(kp.address, message, dict[kp.address] as unknown as Uint8Array)).toBe(true);
  });

  test("a changed message, a different wallet, or a mangled signature all fail", async () => {
    const { kp, signature } = await signed("hello");
    expect(await verifyWalletSignature(kp.address, "hello!", signature)).toBe(false); // message tampered
    const other = await generateKeyPairSigner();
    expect(await verifyWalletSignature(other.address, "hello", signature)).toBe(false); // someone else's address
    const bad = Uint8Array.from(signature);
    bad[0] ^= 0xff;
    expect(await verifyWalletSignature(kp.address, "hello", bad)).toBe(false);
    expect(await verifyWalletSignature(kp.address, "hello", signature.slice(0, 63))).toBe(false); // wrong length
    expect(await verifyWalletSignature("not-an-address", "hello", signature)).toBe(false);
  });

  test("a signature for another site's message does not verify against ours", async () => {
    const kp = await generateKeyPairSigner();
    const theirs = buildSignInMessage({ ...fields(kp.address), domain: "evil.example" });
    const [dict] = await kp.signMessages([{ content: new TextEncoder().encode(theirs), signatures: {} }]);
    const ours = buildSignInMessage(fields(kp.address));
    expect(await verifyWalletSignature(kp.address, ours, dict[kp.address] as unknown as Uint8Array)).toBe(false);
  });
});
