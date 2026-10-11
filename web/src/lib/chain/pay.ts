// Builds the transactions for ONE confidential payment through the vault's pay_employee instruction.
//
// Why several transactions: the three proofs don't fit alongside the transfer, so each is verified into its own "context" account
// first, and a real validator's 1232-byte limit means a context account can't be created and populated in the same transaction as
// its proof (litesvm hides this; the TS client in ../client learned it the hard way).
//   1. create the three context accounts          (the helper pays; the new context keypairs co-sign)
//   2-4. verify equality, ciphertext-validity and range proofs, one transaction each   (the helper)
//   5. pay_employee, which references the three contexts                               (`payer`: the helper in automatic mode, the ADMIN's wallet in manual mode)
//   6. close the three contexts, rent back to the helper                               (the helper)
// Everything except step 5 is always signed by the helper key (see helper-signer.ts). In automatic mode the helper is the vault's
// authorized operator (operator.ts), so it signs step 5 too and a payment needs no wallet prompt; in manual mode the admin's wallet
// approves each pay_employee.
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
import type { ConfidentialAccountView } from "./read";
import type { AppRpc } from "./rpc";
import { proveTransfer } from "@/lib/crypto/proof-client";
import { encodeReceivedAmount } from "@/lib/received-amount";

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
  /** The amount encrypted to the recipient (lib/received-amount.ts), saved with the run so the recipient can read this payment. */
  receivedAmount: string;
}

export interface PaymentInput {
  rpc: Pick<AppRpc, "getMinimumBalanceForRentExemption">;
  /** The vault admin's address (it only seeds the vault PDA here; it signs nothing in a payment). */
  admin: Address;
  /** The payroll helper: pays for and signs the proof-account transactions. */
  helper: TransactionSigner;
  /** Who signs `pay_employee`: the helper (automatic mode, it is the vault's operator) or the admin's wallet (manual mode). */
  payer: TransactionSigner;
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
  const proofs = await proveTransfer({
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
  const ct = ae.encrypt(proofs.newBalance);
  try {
    newDecryptable = ct.toBytes();
  } finally {
    ct.free();
    ae.free();
  }

  const [operatorConfig] = await findOperatorConfigPda({ vault });
  const pay = getPayEmployeeInstruction({
    signer: input.payer,
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
    receivedAmount: encodeReceivedAmount(proofs.destinationCiphertextLo, proofs.destinationCiphertextHi),
  };
}
