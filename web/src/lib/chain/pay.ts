// Builds the transactions for ONE confidential payment through the vault's pay_employee instruction.
//
// Why several transactions: the three proofs don't fit alongside the transfer, so each is verified into its own "context" account
// first, and a real validator's 1232-byte limit means a context account can't be created and populated in the same transaction as
// its proof (litesvm hides this; the TS client in ../client learned it the hard way).
//   1. create the three context accounts          (the helper pays; the new context keypairs co-sign)
//   2-4. verify equality, ciphertext-validity and range proofs, one transaction each   (the helper)
//   5. pay_employee, which references the three contexts                               (the helper, as the vault's authorized operator)
//   6. close the three contexts, rent back to the helper                               (the helper)
// All six are signed by the helper key (see helper-signer.ts), so a payment needs no wallet prompt. The admin's wallet approves
// once, beforehand, with `set_operator` (see operator.ts).
import { address, getAddressEncoder, generateKeyPairSigner, unwrapOption, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  closeContextStateProof,
  verifyBatchedGroupedCiphertext3HandlesValidity,
  verifyBatchedRangeProofU128,
  verifyCiphertextCommitmentEquality,
} from "@solana-program/zk-elgamal-proof";
import { findOperatorConfigPda, findVaultPda, getPayEmployeeInstruction } from "@/generated/vault/src/generated";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { DEVNET_WUSDC_MINT } from "./constants";
import { ataFor, type ConfidentialAccountView } from "./read";
import type { AppRpc } from "./rpc";
import { composeTransferProofs } from "./transfer-proofs";

const WUSDC = address(DEVNET_WUSDC_MINT);
const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");

function setComputeUnitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

/** One transaction to send. Local signers (the helper, the new context accounts) are attached to the instructions themselves. */
export interface TxSpec {
  label: string;
  instructions: Instruction[];
}

export interface PaymentPlan {
  /** In send order. `verify` entries are independent of each other. */
  create: TxSpec;
  verify: TxSpec[];
  transfer: TxSpec;
  close: TxSpec;
  contextAddresses: { equality: Address; validity: Address; range: Address };
  newBalance: bigint;
}

export interface PaymentInput {
  rpc: Pick<AppRpc, "getMinimumBalanceForRentExemption">;
  /** The vault admin's address (it only seeds the vault PDA here; it signs nothing in a payment). */
  admin: Address;
  /** The payroll helper: the vault's authorized operator. Pays for and signs every transaction of the payment. */
  helper: TransactionSigner;
  keys: DerivedKeys;
  /** The vault's treasury token account as just read from the chain. */
  treasury: ConfidentialAccountView;
  /** The treasury's available balance in plaintext (AES-decrypted from that same read). */
  treasuryAvailable: bigint;
  employeeTokenAccount: Address;
  /** The ElGamal public key registered on the employee's account. */
  employeeElgamalPubkey: Address;
  /** The mint's registered auditor ElGamal public key. */
  auditorElgamalPubkey: Address;
  amount: bigint;
}

export async function buildPaymentPlan(input: PaymentInput): Promise<PaymentPlan> {
  const { admin, helper, keys, treasury, amount } = input;
  const ext = (unwrapOption(treasury.token.extensions) ?? []).find((e) => e.__kind === "ConfidentialTransferAccount");
  if (!ext || ext.__kind !== "ConfidentialTransferAccount") throw new Error("The treasury has no confidential-transfer extension.");

  const enc = getAddressEncoder();
  const proofs = await composeTransferProofs({
    currentAvailableCiphertext: Uint8Array.from(ext.availableBalance),
    currentBalance: input.treasuryAvailable,
    amount,
    sourceSecretKey: keys.elgamalKeypair.secretKey,
    destinationPubkey: Uint8Array.from(enc.encode(input.employeeElgamalPubkey)),
    auditorPubkey: Uint8Array.from(enc.encode(input.auditorElgamalPubkey)),
  });

  // The zk action returns [createAccount, verify] when given a context account; we split them into separate transactions.
  const [eqCtx, valCtx, rangeCtx] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner(), generateKeyPairSigner()]);
  const rpc = input.rpc as AppRpc;
  const [eq, val, range] = await Promise.all([
    verifyCiphertextCommitmentEquality({ rpc, payer: helper, proofData: proofs.equality, contextState: { contextAccount: eqCtx, authority: helper.address } }),
    verifyBatchedGroupedCiphertext3HandlesValidity({ rpc, payer: helper, proofData: proofs.validity, contextState: { contextAccount: valCtx, authority: helper.address } }),
    verifyBatchedRangeProofU128({ rpc, payer: helper, proofData: proofs.range, contextState: { contextAccount: rangeCtx, authority: helper.address } }),
  ]);

  const [vault] = await findVaultPda({ admin, mint: WUSDC });
  const { AeKey } = await import("@solana/zk-sdk/bundler");
  const ae = AeKey.fromBytes(keys.aeKey);
  let newDecryptable: Uint8Array;
  try {
    newDecryptable = ae.encrypt(proofs.newBalance).toBytes();
  } finally {
    ae.free();
  }

  const [operatorConfig] = await findOperatorConfigPda({ vault });
  const pay = getPayEmployeeInstruction({
    signer: helper,
    vault,
    mint: WUSDC,
    treasuryTokenAccount: treasury.address,
    employeeTokenAccount: input.employeeTokenAccount,
    equalityProofContext: eqCtx.address,
    ciphertextValidityProofContext: valCtx.address,
    rangeProofContext: rangeCtx.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    operatorConfig,
    newSourceDecryptableAvailableBalance: newDecryptable,
    transferAmountAuditorCiphertextLo: proofs.auditorCiphertextLo,
    transferAmountAuditorCiphertextHi: proofs.auditorCiphertextHi,
  });

  return {
    create: { label: "Create the proof accounts", instructions: [eq[0], val[0], range[0]] },
    verify: [
      { label: "Verify the equality proof", instructions: [eq[1]] },
      { label: "Verify the ciphertext-validity proof", instructions: [val[1]] },
      { label: "Verify the range proof", instructions: [range[1]] },
    ],
    transfer: { label: "Pay the employee", instructions: [setComputeUnitLimit(400_000), pay] },
    close: {
      label: "Close the proof accounts",
      instructions: [eqCtx, valCtx, rangeCtx].map((c) => closeContextStateProof({ contextState: c.address, authority: helper, destination: helper.address })),
    },
    contextAddresses: { equality: eqCtx.address, validity: valCtx.address, range: rangeCtx.address },
    newBalance: proofs.newBalance,
  };
}

/** The employee's ATA for the vault's mint (where pay_employee delivers). */
export const employeeTokenAccountFor = (employee: Address) => ataFor(employee, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
