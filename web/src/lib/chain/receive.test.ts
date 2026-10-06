import { describe, expect, test } from "bun:test";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, type Token } from "@solana-program/token-2022";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";
import { VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { deriveWalletKeys, toMessagePartialSigner, type WalletSignMessage } from "@/lib/crypto/keys";
import { DEVNET_USDC_MINT, DEVNET_WUSDC_MINT } from "./constants";
import { CLASSIC_TOKEN_PROGRAM } from "./fund";
import type { TxSpec } from "./pay";
import { ataFor, type ConfidentialAccountView } from "./read";
import { buildApplyPendingInstruction, buildUnwrapInstruction, buildWithdrawPlan } from "./receive";

const WUSDC = address(DEVNET_WUSDC_MINT);
const USDC = address(DEVNET_USDC_MINT);
const ZK_PROOF_PROGRAM = address("ZkE1Gama1Proof11111111111111111111111111111");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const MAX_TX_BYTES = 1232;

async function fixture(available: bigint, pending = 0n) {
  const owner = await generateKeyPairSigner();
  const sign: WalletSignMessage = async (message) => {
    const [d] = await owner.signMessages([{ content: message, signatures: {} }]);
    return { signature: d[owner.address] as unknown as Uint8Array, signedMessage: message };
  };
  const keys = await deriveWalletKeys(toMessagePartialSigner(owner.address, sign));
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
    allowConfidentialCredits: true,
    allowNonConfidentialCredits: true,
    pendingBalanceCreditCounter: pending > 0n ? 1n : 0n,
    maximumPendingBalanceCreditCounter: 65536n,
    expectedPendingBalanceCreditCounter: 0n,
    actualPendingBalanceCreditCounter: 0n,
  };
  const account: ConfidentialAccountView = {
    address: await ataFor(owner.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS),
    token: { amount: 0n, extensions: { __option: "Some", value: [ext] } } as unknown as Token,
    publicBalance: 0n,
    confidential: true,
    approved: true,
    elgamalPubkey: keys.elgamalKeypair.elgamalPubkey,
  };
  const rpc = { getMinimumBalanceForRentExemption: () => ({ send: async () => 2_000_000n }) };
  const helper = await generateKeyPairSigner();
  return { owner, helper, keys, account, rpc };
}

const wireSize = (feePayer: Awaited<ReturnType<typeof generateKeyPairSigner>>, spec: Pick<TxSpec, "instructions">) => {
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 0n }, m),
    (m) => appendTransactionMessageInstructions(spec.instructions, m),
  );
  return getTransactionEncoder().encode(compileTransaction(msg)).length;
};

describe("buildWithdrawPlan", () => {
  test("the helper does everything except the withdraw; the owner signs only that, and every transaction fits 1232 bytes (with unwrap too)", async () => {
    const f = await fixture(4_000_000n);
    const plan = await buildWithdrawPlan({ rpc: f.rpc as never, owner: f.owner, helper: f.helper, keys: f.keys, account: f.account, available: 4_000_000n, amount: 1_000_000n, unwrap: true });
    const { equality, range } = plan.contextAddresses;

    // 1. two createAccount instructions paid for by the HELPER; the owner is not involved
    expect(plan.create.instructions).toHaveLength(2);
    expect(plan.create.instructions.every((i) => i.programAddress === SYSTEM_PROGRAM)).toBe(true);
    plan.create.instructions.forEach((i, n) => {
      expect(i.accounts![0].address).toBe(f.helper.address);
      expect(i.accounts![1].address).toBe([equality, range][n]);
    });
    expect(plan.create.instructions.flatMap((i) => i.accounts!.map((a) => a.address))).not.toContain(f.owner.address);

    // 2-3. one verify per transaction, pointing at its own context, authority = the helper
    expect(plan.verify).toHaveLength(2);
    plan.verify.forEach((spec, i) => {
      expect(spec.instructions).toHaveLength(1);
      expect(spec.instructions[0].programAddress).toBe(ZK_PROOF_PROGRAM);
      expect(spec.instructions[0].accounts![0].address).toBe([equality, range][i]);
      expect(spec.instructions[0].accounts!.map((a) => a.address)).not.toContain(f.owner.address);
    });

    // 4. withdraw_confidential (Token-2022, not the classic program) with the contexts in the order the program expects, then unwrap
    const [, withdraw, unwrap] = plan.withdraw.instructions;
    expect(withdraw.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
    expect(withdraw.accounts!.map((a) => a.address)).toEqual([f.owner.address, WUSDC, f.account.address, equality, range, TOKEN_2022_PROGRAM_ADDRESS]);
    expect(Uint8Array.from(withdraw.data!)).toHaveLength(8 + 8 + 36);
    expect(unwrap.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
    expect(unwrap.accounts![0].address).toBe(f.owner.address);

    // 5. two CloseContextState instructions whose rent goes back to the helper
    expect(plan.close.instructions).toHaveLength(2);
    plan.close.instructions.forEach((i) => {
      expect(i.programAddress).toBe(ZK_PROOF_PROGRAM);
      expect(i.accounts!.map((a) => a.address)).toContain(f.helper.address);
      expect(i.accounts!.map((a) => a.address)).not.toContain(f.owner.address);
    });

    // The point of splitting: a real validator rejects anything over 1232 bytes.
    for (const spec of [plan.create, ...plan.verify, plan.close]) expect(wireSize(f.helper, spec)).toBeLessThanOrEqual(MAX_TX_BYTES);
    expect(wireSize(f.owner, plan.withdraw)).toBeLessThanOrEqual(MAX_TX_BYTES);
    expect(plan.newBalance).toBe(3_000_000n);
  }, 90_000);

  test("without unwrap the withdraw transaction holds no unwrap instruction", async () => {
    const f = await fixture(4_000_000n);
    const plan = await buildWithdrawPlan({ rpc: f.rpc as never, owner: f.owner, helper: f.helper, keys: f.keys, account: f.account, available: 4_000_000n, amount: 250_000n, unwrap: false });
    expect(plan.withdraw.instructions).toHaveLength(2); // compute budget + withdraw
  }, 60_000);

  test("refuses more than the available balance", async () => {
    const f = await fixture(1_000_000n);
    await expect(buildWithdrawPlan({ rpc: f.rpc as never, owner: f.owner, helper: f.helper, keys: f.keys, account: f.account, available: 1_000_000n, amount: 2_000_000n, unwrap: false })).rejects.toThrow();
  }, 30_000);
});

describe("buildUnwrapInstruction", () => {
  test("pays out into the owner's classic USDC account", async () => {
    const owner = await generateKeyPairSigner();
    const ix = await buildUnwrapInstruction({ owner, amount: 123n });
    const addrs = ix.accounts!.map((a) => a.address);
    expect(addrs[0]).toBe(owner.address);
    expect(addrs[1]).toBe(USDC);
    expect(addrs[2]).toBe(await ataFor(owner.address, USDC, CLASSIC_TOKEN_PROGRAM));
    expect(addrs[3]).toBe(WUSDC);
    expect(addrs).toContain(await ataFor(owner.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS));
    expect(addrs).toContain(CLASSIC_TOKEN_PROGRAM);
  });
});

describe("buildApplyPendingInstruction", () => {
  test("is a Token-2022 instruction signed by the owner, on the owner's account", async () => {
    const f = await fixture(1_000_000n, 500_000n);
    const ix = await buildApplyPendingInstruction({ account: f.account, keys: f.keys, owner: f.owner });
    expect(ix.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    expect(ix.accounts![0].address).toBe(f.account.address);
    expect(ix.accounts!.map((a) => a.address)).toContain(f.owner.address);
  }, 30_000);
});
