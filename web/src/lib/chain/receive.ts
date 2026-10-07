// Builds the transactions an EMPLOYEE (any wallet that gets paid) sends to turn received pay into spendable money.
//
//   apply pending   Token-2022 ApplyPendingBalance (called directly, not through the vault): moves received pay from "pending" into "available".
//   withdraw        vault::withdraw_confidential: available (encrypted) -> the public WUSDC balance. The amount becomes public: this is the disclosure point.
//   unwrap          vault::unwrap_confidential: public WUSDC -> plain USDC. Optional, and it can ride in the same transaction as the withdraw.
//
// Withdraw needs two proofs (equality, 64-bit range). They don't fit alongside the instruction, so each is verified into its own context
// account first, exactly like a payment (pay.ts), and for the same reason the wallet is asked for as little as possible: the PAYROLL HELPER
// (helper-signer.ts) creates, verifies and closes those accounts, and the owner's wallet signs only the transactions that need the owner.
import { address, generateKeyPairSigner, unwrapOption, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { closeContextStateProof, verifyBatchedRangeProofU64, verifyCiphertextCommitmentEquality } from "@solana-program/zk-elgamal-proof";
import { findWrappedMintAuthorityPda, getUnwrapConfidentialInstruction, getWithdrawConfidentialInstruction } from "@/generated/vault/src/generated";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { DEVNET_USDC_MINT, DEVNET_WUSDC_MINT, TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS } from "./constants";
import { CLASSIC_TOKEN_PROGRAM } from "./fund";
import type { TxSpec } from "./pay";
import { ataFor, type ConfidentialAccountView } from "./read";
import type { AppRpc } from "./rpc";
import { proveWithdraw } from "@/lib/crypto/proof-client";

const USDC = address(DEVNET_USDC_MINT);
const WUSDC = address(DEVNET_WUSDC_MINT);
const TOKEN_WRAP = address(TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS);
const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");

function setComputeUnitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

/**
 * Token-2022 ApplyPendingBalance for the owner's account. The library helper reads the account's pending-credit counter and encrypts
 * the new available balance (available + pending) with the AES key, so the account's "decryptable" balance stays current.
 */
export async function buildApplyPendingInstruction(input: { account: ConfidentialAccountView; keys: DerivedKeys; owner: TransactionSigner }): Promise<Instruction> {
  // Lazy, like every other zk-sdk import: the WASM must only load in the browser, never while Next prerenders pages on the server.
  const [{ AeKey, ElGamalSecretKey }, { getApplyConfidentialPendingBalanceInstructionFromToken }] = await Promise.all([import("@solana/zk-sdk/bundler"), import("@solana-program/token-2022/confidential")]);
  const aesKey = AeKey.fromBytes(input.keys.aeKey);
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(input.keys.elgamalKeypair.secretKey);
  try {
    return getApplyConfidentialPendingBalanceInstructionFromToken({ token: input.account.address, tokenAccount: input.account.token, authority: input.owner, elgamalSecretKey, aesKey });
  } finally {
    aesKey.free();
    elgamalSecretKey.free();
  }
}

/** vault::unwrap_confidential: burns `amount` of the owner's PUBLIC wrapped balance and releases the same amount of plain USDC from escrow. */
export async function buildUnwrapInstruction(input: { owner: TransactionSigner; amount: bigint }): Promise<Instruction> {
  const { owner, amount } = input;
  // The wrapped-mint authority belongs to the token-wrap program, so the generated finder (which defaults to the vault program) must be told.
  const [wrappedMintAuthority] = await findWrappedMintAuthorityPda({ wrappedMint: WUSDC }, { programAddress: TOKEN_WRAP });
  return getUnwrapConfidentialInstruction({
    owner,
    unwrappedMint: USDC,
    ownerUnwrappedTokenAccount: await ataFor(owner.address, USDC, CLASSIC_TOKEN_PROGRAM),
    wrappedMint: WUSDC,
    wrappedMintAuthority,
    escrow: await ataFor(wrappedMintAuthority, USDC, CLASSIC_TOKEN_PROGRAM),
    ownerWrappedTokenAccount: await ataFor(owner.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS),
    tokenWrapProgram: TOKEN_WRAP,
    unwrappedTokenProgram: CLASSIC_TOKEN_PROGRAM,
    wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    amount,
  });
}

export interface WithdrawPlan {
  /** Both proof accounts are created in one transaction (the helper pays; the new context keypairs co-sign). */
  create: TxSpec;
  /** One verify per transaction, independent of each other. */
  verify: TxSpec[];
  /** Signed by the OWNER's wallet: `withdraw_confidential`, plus `unwrap_confidential` when requested. */
  withdraw: TxSpec;
  close: TxSpec;
  contextAddresses: { equality: Address; range: Address };
  newBalance: bigint;
}

export interface WithdrawInput {
  rpc: Pick<AppRpc, "getMinimumBalanceForRentExemption">;
  /** The wallet that owns the account and signs the withdraw. */
  owner: TransactionSigner;
  /** Pays for, signs and closes the two proof accounts (see helper-signer.ts). */
  helper: TransactionSigner;
  keys: DerivedKeys;
  /** The owner's WUSDC account as just read from the chain (after any pending balance was applied). */
  account: ConfidentialAccountView;
  /** That account's available balance in plaintext (AES-decrypted from the same read). */
  available: bigint;
  amount: bigint;
  /** Also unwrap the withdrawn amount into plain USDC in the same transaction. */
  unwrap: boolean;
}

export async function buildWithdrawPlan(input: WithdrawInput): Promise<WithdrawPlan> {
  const { owner, helper, keys, account, amount, unwrap } = input;
  const ext = (unwrapOption(account.token.extensions) ?? []).find((e) => e.__kind === "ConfidentialTransferAccount");
  if (!ext || ext.__kind !== "ConfidentialTransferAccount") throw new Error("This account has no confidential-transfer extension.");

  const proofs = await proveWithdraw({ currentAvailableCiphertext: Uint8Array.from(ext.availableBalance), currentBalance: input.available, amount, secretKey: keys.elgamalKeypair.secretKey });

  const [eqCtx, rangeCtx] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
  const rpc = input.rpc as AppRpc;
  // The zk action returns [createAccount, verify] when given a context account; we split them into separate transactions.
  const [eq, range] = await Promise.all([
    verifyCiphertextCommitmentEquality({ rpc, payer: helper, proofData: proofs.equality, contextState: { contextAccount: eqCtx, authority: helper.address } }),
    verifyBatchedRangeProofU64({ rpc, payer: helper, proofData: proofs.range, contextState: { contextAccount: rangeCtx, authority: helper.address } }),
  ]);

  const { AeKey } = await import("@solana/zk-sdk/bundler");
  const ae = AeKey.fromBytes(keys.aeKey);
  let newDecryptable: Uint8Array;
  const ct = ae.encrypt(proofs.newBalance);
  try {
    newDecryptable = ct.toBytes();
  } finally {
    ct.free();
    ae.free();
  }

  const withdraw = getWithdrawConfidentialInstruction({
    owner,
    mint: WUSDC,
    tokenAccount: account.address,
    equalityProofContext: eqCtx.address,
    rangeProofContext: rangeCtx.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    amount,
    newDecryptableAvailableBalance: newDecryptable,
  });

  return {
    create: { label: "Create the proof accounts", instructions: [eq[0], range[0]] },
    verify: [
      { label: "Verify the equality proof", instructions: [eq[1]] },
      { label: "Verify the range proof", instructions: [range[1]] },
    ],
    withdraw: { label: unwrap ? "Withdraw and unwrap" : "Withdraw", instructions: [setComputeUnitLimit(400_000), withdraw, ...(unwrap ? [await buildUnwrapInstruction({ owner, amount })] : [])] },
    close: { label: "Close the proof accounts", instructions: [eqCtx, rangeCtx].map((c) => closeContextStateProof({ contextState: c.address, authority: helper, destination: helper.address })) },
    contextAddresses: { equality: eqCtx.address, range: rangeCtx.address },
    newBalance: proofs.newBalance,
  };
}
