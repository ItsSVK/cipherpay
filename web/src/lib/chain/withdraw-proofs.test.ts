import { describe, expect, test } from "bun:test";
import { BatchedRangeProofU64Data, CiphertextCommitmentEqualityProofData, ElGamalKeypair } from "@solana/zk-sdk/bundler";
import { composeWithdrawProofs } from "./withdraw-proofs";

const setup = (balance: bigint) => {
  const owner = new ElGamalKeypair();
  return { owner, currentCt: owner.pubkey().encryptU64(balance).toBytes() };
};

describe("composeWithdrawProofs", () => {
  test("both proofs verify for a partial withdrawal", async () => {
    const s = setup(5_000_000n);
    const p = await composeWithdrawProofs({ currentAvailableCiphertext: s.currentCt, currentBalance: 5_000_000n, amount: 1_250_000n, secretKey: s.owner.secret().toBytes() });
    expect(() => CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify()).not.toThrow();
    expect(() => BatchedRangeProofU64Data.fromBytes(p.range).verify()).not.toThrow();
    expect(p.newBalance).toBe(3_750_000n);
  }, 60_000);

  test("works for tiny amounts and for the entire balance", async () => {
    const s = setup(70_000n);
    for (const amount of [1n, 65_536n, 70_000n]) {
      const p = await composeWithdrawProofs({ currentAvailableCiphertext: s.currentCt, currentBalance: 70_000n, amount, secretKey: s.owner.secret().toBytes() });
      expect(() => CiphertextCommitmentEqualityProofData.fromBytes(p.equality).verify()).not.toThrow();
      expect(() => BatchedRangeProofU64Data.fromBytes(p.range).verify()).not.toThrow();
      expect(p.newBalance).toBe(70_000n - amount);
    }
  }, 120_000);

  test("refuses zero and anything above the available balance", async () => {
    const s = setup(100n);
    const base = { currentAvailableCiphertext: s.currentCt, currentBalance: 100n, secretKey: s.owner.secret().toBytes() };
    await expect(composeWithdrawProofs({ ...base, amount: 0n })).rejects.toThrow();
    await expect(composeWithdrawProofs({ ...base, amount: 101n })).rejects.toThrow();
  });

  test("a wrong balance claim is rejected while building the proof, not discovered on-chain", async () => {
    const s = setup(100n); // the ciphertext encrypts 100, we claim 500
    await expect(composeWithdrawProofs({ currentAvailableCiphertext: s.currentCt, currentBalance: 500n, amount: 10n, secretKey: s.owner.secret().toBytes() })).rejects.toThrow();
  }, 60_000);
});
