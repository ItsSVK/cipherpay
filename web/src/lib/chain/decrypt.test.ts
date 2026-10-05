import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import type { Token } from "@solana-program/token-2022";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { decryptAccountBalance, WrongKeyError } from "./decrypt";
import type { ConfidentialAccountView } from "./read";

async function softKeys() {
  const kp = await generateKeyPairSigner();
  const sign: WalletSignMessage = async (message) => {
    const [d] = await kp.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[kp.address] as unknown as Uint8Array, signedMessage: message };
  };
  return deriveWalletKeys(toMessagePartialSigner(kp.address, sign));
}

/** A synthetic confidential account whose ciphertexts are really encrypted under the given keys. */
function accountFor(keys: Awaited<ReturnType<typeof softKeys>>, opts: { available: bigint; pendingLo: bigint; pendingHi: bigint; registeredPubkey?: string }): ConfidentialAccountView {
  const secret = ElGamalSecretKey.fromBytes(keys.elgamalKeypair.secretKey);
  const keypair = ElGamalKeypair.fromSecretKey(secret);
  const pub = keypair.pubkey();
  const ae = AeKey.fromBytes(keys.aeKey);
  const ext = {
    __kind: "ConfidentialTransferAccount" as const,
    approved: true,
    elgamalPubkey: keys.elgamalKeypair.elgamalPubkey,
    pendingBalanceLow: pub.encryptU64(opts.pendingLo).toBytes(),
    pendingBalanceHigh: pub.encryptU64(opts.pendingHi).toBytes(),
    availableBalance: pub.encryptU64(opts.available).toBytes(),
    decryptableAvailableBalance: ae.encrypt(opts.available).toBytes(),
    allowConfidentialCredits: true,
    allowNonConfidentialCredits: true,
    pendingBalanceCreditCounter: 1n,
    maximumPendingBalanceCreditCounter: 65536n,
    expectedPendingBalanceCreditCounter: 0n,
    actualPendingBalanceCreditCounter: 0n,
  };
  const token = { amount: 0n, extensions: { __option: "Some", value: [ext] } } as unknown as Token;
  return { address: keys.elgamalKeypair.elgamalPubkey, token, publicBalance: 0n, confidential: true, approved: true, elgamalPubkey: opts.registeredPubkey ?? keys.elgamalKeypair.elgamalPubkey };
}

describe("decryptAccountBalance", () => {
  test("recovers available and pending amounts encrypted under the wallet's keys", async () => {
    const keys = await softKeys();
    // pending = lo + hi * 2^16, the same split the program uses
    const view = accountFor(keys, { available: 1_234_567n, pendingLo: 4_242n, pendingHi: 3n });
    const b = await decryptAccountBalance(view, keys);
    expect(b.available).toBe(1_234_567n);
    expect(b.pending).toBe(4_242n + 3n * 65_536n);
    expect(b.total).toBe(b.available + b.pending);
  }, 30_000);

  test("an account registered under a different key gets a clear error, not garbage", async () => {
    const keys = await softKeys();
    const other = await softKeys();
    const view = accountFor(keys, { available: 5n, pendingLo: 0n, pendingHi: 0n, registeredPubkey: other.elgamalKeypair.elgamalPubkey });
    await expect(decryptAccountBalance(view, keys)).rejects.toBeInstanceOf(WrongKeyError);
  });
});
