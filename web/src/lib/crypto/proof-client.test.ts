import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import type { Token } from "@solana-program/token-2022";
import { AeKey, BatchedRangeProofU64Data, CiphertextCommitmentEqualityProofData, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";
import { WrongKeyError } from "@/lib/chain/decrypt-local";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "./keys";
import { decryptOffThread, proofWorkerStatus, proveTransfer, proveWithdraw } from "./proof-client";

async function softKeys() {
  const kp = await generateKeyPairSigner();
  const sign: WalletSignMessage = async (message) => {
    const [d] = await kp.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[kp.address] as unknown as Uint8Array, signedMessage: message };
  };
  return deriveWalletKeys(toMessagePartialSigner(kp.address, sign));
}

const accountFor = (keys: Awaited<ReturnType<typeof softKeys>>, available: bigint, pending: bigint) => {
  const pub = ElGamalKeypair.fromSecretKey(ElGamalSecretKey.fromBytes(keys.elgamalKeypair.secretKey)).pubkey();
  const ae = AeKey.fromBytes(keys.aeKey);
  const ext = {
    __kind: "ConfidentialTransferAccount" as const,
    approved: true,
    elgamalPubkey: keys.elgamalKeypair.elgamalPubkey,
    pendingBalanceLow: pub.encryptU64(pending).toBytes(),
    pendingBalanceHigh: pub.encryptU64(0n).toBytes(),
    availableBalance: pub.encryptU64(available).toBytes(),
    decryptableAvailableBalance: ae.encrypt(available).toBytes(),
    pendingBalanceCreditCounter: 1n,
    maximumPendingBalanceCreditCounter: 65536n,
    expectedPendingBalanceCreditCounter: 0n,
    actualPendingBalanceCreditCounter: 0n,
    allowConfidentialCredits: true,
    allowNonConfidentialCredits: true,
  };
  return { token: { amount: 0n, extensions: { __option: "Some", value: [ext] } } as unknown as Token, elgamalPubkey: keys.elgamalKeypair.elgamalPubkey as string | null };
};

describe("the proof worker", () => {
  test("decrypts on the worker (not the fallback) and leaves the caller's keys untouched", async () => {
    const keys = await softKeys();
    const b = await decryptOffThread(accountFor(keys, 3_000_000n, 500_000n), keys);
    expect([b.available, b.pending, b.total]).toEqual([3_000_000n, 500_000n, 3_500_000n]);
    expect(proofWorkerStatus()).toEqual({ running: true, broken: false }); // the work really ran on a worker
    // The worker zeroes ITS copy of the secrets; the page's must be intact, or the next call would use a zeroed key.
    expect(keys.aeKey.some((x) => x !== 0)).toBe(true);
    expect(keys.elgamalKeypair.secretKey.some((x) => x !== 0)).toBe(true);
    const again = await decryptOffThread(accountFor(keys, 7n, 0n), keys);
    expect(again.available).toBe(7n);
  }, 60_000);

  test("a key that doesn't match the account is reported as WrongKeyError, with its original type", async () => {
    const mine = await softKeys();
    const other = await softKeys();
    await expect(decryptOffThread(accountFor(other, 1n, 0n), mine)).rejects.toBeInstanceOf(WrongKeyError);
  }, 60_000);

  test("transfer proofs built on the worker verify, and the worker is not given up on", async () => {
    const source = new ElGamalKeypair();
    const p = await proveTransfer({
      currentAvailableCiphertext: source.pubkey().encryptU64(5_000_000n).toBytes(),
      currentBalance: 5_000_000n,
      amount: 1_250_000n,
      sourceSecretKey: source.secret().toBytes(),
      destinationPubkey: new ElGamalKeypair().pubkey().toBytes(),
      auditorPubkey: new ElGamalKeypair().pubkey().toBytes(),
    });
    expect(() => CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify()).not.toThrow();
    expect(p.newBalance).toBe(3_750_000n);
    expect(proofWorkerStatus().broken).toBe(false);
  }, 60_000);

  test("withdraw proofs built on the worker verify", async () => {
    const owner = new ElGamalKeypair();
    const secret = owner.secret().toBytes();
    const p = await proveWithdraw({ currentAvailableCiphertext: owner.pubkey().encryptU64(4_000_000n).toBytes(), currentBalance: 4_000_000n, amount: 1_000_000n, secretKey: secret });
    expect(() => CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify()).not.toThrow();
    expect(() => BatchedRangeProofU64Data.fromBytes(p.range).verify()).not.toThrow();
    expect(secret.some((x) => x !== 0)).toBe(true); // the caller's secret was copied, not consumed
  }, 60_000);

  test("an error from the work itself comes back as an error (it is not retried on the main thread or swallowed)", async () => {
    const owner = new ElGamalKeypair();
    await expect(proveWithdraw({ currentAvailableCiphertext: owner.pubkey().encryptU64(10n).toBytes(), currentBalance: 10n, amount: 11n, secretKey: owner.secret().toBytes() })).rejects.toThrow(/more than your available balance/);
    expect(proofWorkerStatus().broken).toBe(false);
  }, 60_000);
});
