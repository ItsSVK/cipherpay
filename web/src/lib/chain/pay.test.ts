import { describe, expect, test } from "bun:test";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, type Token } from "@solana-program/token-2022";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";
import { findVaultPda, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { DEVNET_WUSDC_MINT } from "./constants";
import { buildPaymentPlan, type TxSpec } from "./pay";
import type { ConfidentialAccountView } from "./read";

const WUSDC = address(DEVNET_WUSDC_MINT);
const ZK_PROOF_PROGRAM = address("ZkE1Gama1Proof11111111111111111111111111111");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const MAX_TX_BYTES = 1232;
const decodeAddr = getAddressDecoder();

async function fixture(available: bigint) {
  const signer = await generateKeyPairSigner();
  const sign: WalletSignMessage = async (message) => {
    const [d] = await signer.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[signer.address] as unknown as Uint8Array, signedMessage: message };
  };
  const keys = await deriveWalletKeys(toMessagePartialSigner(signer.address, sign));
  const secret = ElGamalSecretKey.fromBytes(keys.elgamalKeypair.secretKey);
  const pub = ElGamalKeypair.fromSecretKey(secret).pubkey();
  const ae = AeKey.fromBytes(keys.aeKey);
  const ext = {
    __kind: "ConfidentialTransferAccount" as const,
    approved: true,
    elgamalPubkey: keys.elgamalKeypair.elgamalPubkey,
    pendingBalanceLow: new Uint8Array(64),
    pendingBalanceHigh: new Uint8Array(64),
    availableBalance: pub.encryptU64(available).toBytes(),
    decryptableAvailableBalance: ae.encrypt(available).toBytes(),
    allowConfidentialCredits: true,
    allowNonConfidentialCredits: true,
    pendingBalanceCreditCounter: 0n,
    maximumPendingBalanceCreditCounter: 65536n,
    expectedPendingBalanceCreditCounter: 0n,
    actualPendingBalanceCreditCounter: 0n,
  };
  const treasury: ConfidentialAccountView = {
    address: await generateKeyPairSigner().then((k) => k.address),
    token: { amount: 0n, extensions: { __option: "Some", value: [ext] } } as unknown as Token,
    publicBalance: 0n,
    confidential: true,
    approved: true,
    elgamalPubkey: keys.elgamalKeypair.elgamalPubkey,
  };
  const employee = new ElGamalKeypair();
  const auditor = new ElGamalKeypair();
  const rpc = { getMinimumBalanceForRentExemption: () => ({ send: async () => 2_000_000n }) };
  const helper = await generateKeyPairSigner();
  return { signer, helper, keys, treasury, rpc, employeeToken: (await generateKeyPairSigner()).address, employeePub: decodeAddr.decode(employee.pubkey().toBytes()), auditorPub: decodeAddr.decode(auditor.pubkey().toBytes()) };
}

const wireSize = (feePayer: Awaited<ReturnType<typeof generateKeyPairSigner>>, spec: TxSpec) => {
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 0n }, m),
    (m) => appendTransactionMessageInstructions(spec.instructions, m),
  );
  return getTransactionEncoder().encode(compileTransaction(msg)).length;
};

describe("buildPaymentPlan", () => {
  test("only pay_employee is the admin's; the proof-account transactions belong to the helper; every transaction fits the real 1232-byte limit", async () => {
    const f = await fixture(9_000_000n);
    const plan = await buildPaymentPlan({ rpc: f.rpc as never, admin: f.signer, helper: f.helper, keys: f.keys, treasury: f.treasury, treasuryAvailable: 9_000_000n, employeeTokenAccount: f.employeeToken, employeeElgamalPubkey: f.employeePub, auditorElgamalPubkey: f.auditorPub, amount: 1_250_000n });
    const { equality, validity, range } = plan.contextAddresses;

    // 1. three createAccount instructions paid for by the HELPER, with the three new context accounts as signers
    expect(plan.create.instructions).toHaveLength(3);
    expect(plan.create.instructions.every((i) => i.programAddress === SYSTEM_PROGRAM)).toBe(true);
    plan.create.instructions.forEach((i, n) => {
      const metas = i.accounts!;
      expect(metas[0].address).toBe(f.helper.address); // payer
      expect(metas[1].address).toBe([equality, validity, range][n]); // the new context account
    });
    expect(plan.create.instructions.flatMap((i) => i.accounts!.map((a) => a.address))).not.toContain(f.signer.address); // the admin is not involved

    // 2-4. one verify per transaction, each pointing at its own context account, authority = the helper
    expect(plan.verify).toHaveLength(3);
    plan.verify.forEach((spec, i) => {
      expect(spec.instructions).toHaveLength(1);
      expect(spec.instructions[0].programAddress).toBe(ZK_PROOF_PROGRAM);
      expect(spec.instructions[0].accounts![0].address).toBe([equality, validity, range][i]);
      expect(spec.instructions[0].accounts!.map((a) => a.address)).toContain(f.helper.address);
      expect(spec.instructions[0].accounts!.map((a) => a.address)).not.toContain(f.signer.address);
    });

    // 5. pay_employee, after a compute-budget instruction, signed by the ADMIN, with the contexts in the order the program expects
    const pay = plan.transfer.instructions[1];
    expect(pay.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
    const [vault] = await findVaultPda({ admin: f.signer.address, mint: WUSDC });
    expect(pay.accounts!.map((a) => a.address)).toEqual([f.signer.address, vault, WUSDC, f.treasury.address, f.employeeToken, equality, validity, range, TOKEN_2022_PROGRAM_ADDRESS]);
    expect(Uint8Array.from(pay.data!)).toHaveLength(8 + 36 + 64 + 64);

    // 6. three CloseContextState instructions: authority and destination are the helper, so the rent comes back to it
    expect(plan.close.instructions).toHaveLength(3);
    plan.close.instructions.forEach((i) => {
      expect(i.programAddress).toBe(ZK_PROOF_PROGRAM);
      const addrs = i.accounts!.map((a) => a.address);
      expect(addrs).toContain(f.helper.address);
      expect(addrs).not.toContain(f.signer.address);
    });

    // The point of splitting: a real validator rejects anything over 1232 bytes.
    for (const spec of [plan.create, ...plan.verify, plan.close]) expect(wireSize(f.helper, spec)).toBeLessThanOrEqual(MAX_TX_BYTES);
    expect(wireSize(f.signer, plan.transfer)).toBeLessThanOrEqual(MAX_TX_BYTES);
    expect(plan.newBalance).toBe(9_000_000n - 1_250_000n);
  }, 90_000);

  test("refuses to pay more than the treasury holds", async () => {
    const f = await fixture(1_000_000n);
    await expect(buildPaymentPlan({ rpc: f.rpc as never, admin: f.signer, helper: f.helper, keys: f.keys, treasury: f.treasury, treasuryAvailable: 1_000_000n, employeeTokenAccount: f.employeeToken, employeeElgamalPubkey: f.employeePub, auditorElgamalPubkey: f.auditorPub, amount: 2_000_000n })).rejects.toThrow();
  }, 30_000);
});
