import { describe, expect, test } from "bun:test";
import {
  AeKey,
  BatchedGroupedCiphertext3HandlesValidityProofData,
  BatchedRangeProofU128Data,
  CiphertextCommitmentEqualityProofData,
  ElGamalCiphertext,
  ElGamalKeypair,
} from "@solana/zk-sdk/bundler";
import { composeTransferProofs } from "./transfer-proofs";

function setup(balance: bigint) {
  const source = new ElGamalKeypair();
  const destination = new ElGamalKeypair();
  const auditor = new ElGamalKeypair();
  const ae = new AeKey();
  return { source, destination, auditor, ae, currentCt: source.pubkey().encryptU64(balance).toBytes() };
}

describe("composeTransferProofs", () => {
  test("all three proofs verify, and the auditor ciphertexts decrypt to lo + hi * 2^16", async () => {
    const balance = 5_000_000n;
    const amount = 1_250_000n; // > 2^16 so both the low and high halves are non-zero
    const s = setup(balance);
    const p = await composeTransferProofs({
      currentAvailableCiphertext: s.currentCt,
      currentBalance: balance,
      amount,
      sourceSecretKey: s.source.secret().toBytes(),
      destinationPubkey: s.destination.pubkey().toBytes(),
      auditorPubkey: s.auditor.pubkey().toBytes(),
    });

    expect(() => CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify()).not.toThrow();
    expect(() => BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(p.validity).verify()).not.toThrow();
    expect(() => BatchedRangeProofU128Data.fromBytes(p.range).verify()).not.toThrow();

    // This is exactly how the auditor reads PayEmployeeEvent.
    const auditorSecret = s.auditor.secret();
    const lo = auditorSecret.decrypt(ElGamalCiphertext.fromBytes(p.auditorCiphertextLo)!);
    const hi = auditorSecret.decrypt(ElGamalCiphertext.fromBytes(p.auditorCiphertextHi)!);
    expect(lo + hi * 65_536n).toBe(amount);
    expect(p.newBalance).toBe(balance - amount);
  }, 60_000);

  test("works when paying the entire balance (new balance zero) and tiny amounts", async () => {
    const s = setup(70_000n);
    for (const amount of [1n, 65_536n, 70_000n]) {
      const p = await composeTransferProofs({ currentAvailableCiphertext: s.currentCt, currentBalance: 70_000n, amount, sourceSecretKey: s.source.secret().toBytes(), destinationPubkey: s.destination.pubkey().toBytes(), auditorPubkey: s.auditor.pubkey().toBytes() });
      expect(() => BatchedRangeProofU128Data.fromBytes(p.range).verify()).not.toThrow();
      expect(p.newBalance).toBe(70_000n - amount);
    }
  }, 120_000);

  test("refuses an amount above the available balance, or zero", async () => {
    const s = setup(100n);
    const base = { currentAvailableCiphertext: s.currentCt, currentBalance: 100n, sourceSecretKey: s.source.secret().toBytes(), destinationPubkey: s.destination.pubkey().toBytes(), auditorPubkey: s.auditor.pubkey().toBytes() };
    await expect(composeTransferProofs({ ...base, amount: 101n })).rejects.toThrow();
    await expect(composeTransferProofs({ ...base, amount: 0n })).rejects.toThrow();
  });

  test("a wrong balance claim is rejected while building the proof, not discovered on-chain", async () => {
    // The ciphertext encrypts 100 but we claim 500: the library refuses to build an equality proof for that.
    const s = setup(100n);
    await expect(
      composeTransferProofs({ currentAvailableCiphertext: s.currentCt, currentBalance: 500n, amount: 10n, sourceSecretKey: s.source.secret().toBytes(), destinationPubkey: s.destination.pubkey().toBytes(), auditorPubkey: s.auditor.pubkey().toBytes() }),
    ).rejects.toThrow();
  }, 60_000);
});
