// Builds the treasury-funding transaction: wrap USDC -> WUSDC, move it into the treasury (both public),
// deposit it into the treasury's encrypted pending balance, then apply it so payroll can spend it.
import { address, unwrapOption, type Instruction, type TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  findVaultPda,
  findWrappedMintAuthorityPda,
  getApplyTreasuryPendingInstruction,
  getDepositConfidentialInstruction,
  getFundTreasuryInstruction,
  getWrapConfidentialInstruction,
} from "@/generated/vault/src/generated";
import type { DecryptedBalance } from "./decrypt";
import { DEVNET_USDC_MINT, DEVNET_WUSDC_MINT, TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS } from "./constants";
import { ataFor, type ConfidentialAccountView } from "./read";
import type { DerivedKeys } from "@/lib/crypto/keys";

const USDC = address(DEVNET_USDC_MINT);
const WUSDC = address(DEVNET_WUSDC_MINT);
const TOKEN_WRAP = address(TOKEN_WRAP_COMPLIANCE_PROGRAM_ADDRESS);
/** Real devnet USDC lives under the classic SPL Token program. */
export const CLASSIC_TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");

/** ComputeBudget::SetComputeUnitLimit. Wrapping creates two token accounts, so give the whole bundle headroom. */
function setComputeUnitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

/** What the treasury holds right now, decrypted, plus the counter Token-2022 checks when applying pending credits. */
export interface TreasurySnapshot {
  available: bigint;
  pending: bigint;
  /** The account's actual pending-credit counter. After our deposit it will be this + 1. */
  pendingCreditCounter: bigint;
}

export function snapshotTreasury(view: ConfidentialAccountView, balance: DecryptedBalance): TreasurySnapshot {
  const ext = (unwrapOption(view.token.extensions) ?? []).find((e) => e.__kind === "ConfidentialTransferAccount");
  if (!ext || ext.__kind !== "ConfidentialTransferAccount") throw new Error("The treasury account has no confidential-transfer extension.");
  return { available: balance.available, pending: balance.pending, pendingCreditCounter: ext.pendingBalanceCreditCounter };
}

/**
 * [SetComputeUnitLimit, wrap_confidential, fund_treasury, deposit_confidential, apply_treasury_pending] as one
 * transaction: one approval, and the money is never left half-way (wrapped but not deposited).
 */
export async function buildFundTreasuryInstructions(input: { signer: TransactionSigner; keys: DerivedKeys; amount: bigint; treasury: TreasurySnapshot }): Promise<Instruction[]> {
  const { signer, keys, amount, treasury } = input;
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  const admin = signer.address;

  const [vault] = await findVaultPda({ admin, mint: WUSDC });
  const treasuryTokenAccount = await ataFor(vault, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
  const adminUsdc = await ataFor(admin, USDC, CLASSIC_TOKEN_PROGRAM);
  const adminWusdc = await ataFor(admin, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
  // These two PDAs belong to the token-wrap program. The generated finders default to the vault program's address, so name it.
  const [wrappedMintAuthority] = await findWrappedMintAuthorityPda({ wrappedMint: WUSDC }, { programAddress: TOKEN_WRAP });
  const escrow = await ataFor(wrappedMintAuthority, USDC, CLASSIC_TOKEN_PROGRAM);

  // The treasury's new spendable balance, AES-encrypted so the admin can read it quickly later.
  const { AeKey } = await import("@solana/zk-sdk/bundler");
  const ae = AeKey.fromBytes(keys.aeKey);
  let newDecryptableAvailableBalance: Uint8Array;
  try {
    newDecryptableAvailableBalance = ae.encrypt(treasury.available + treasury.pending + amount).toBytes();
  } finally {
    ae.free();
  }

  return [
    setComputeUnitLimit(600_000),
    getWrapConfidentialInstruction({
      owner: signer,
      unwrappedMint: USDC,
      ownerUnwrappedTokenAccount: adminUsdc,
      wrappedMint: WUSDC,
      wrappedMintAuthority,
      escrow,
      ownerWrappedTokenAccount: adminWusdc,
      tokenWrapProgram: TOKEN_WRAP,
      unwrappedTokenProgram: CLASSIC_TOKEN_PROGRAM,
      wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      amount,
    }),
    getFundTreasuryInstruction({ funder: signer, funderTokenAccount: adminWusdc, vault, mint: WUSDC, treasuryTokenAccount, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, amount }),
    getDepositConfidentialInstruction({ admin: signer, vault, mint: WUSDC, treasuryTokenAccount, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, amount }),
    getApplyTreasuryPendingInstruction({
      admin: signer,
      vault,
      treasuryTokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      expectedPendingBalanceCreditCounter: treasury.pendingCreditCounter + 1n,
      newDecryptableAvailableBalance,
    }),
  ];
}

