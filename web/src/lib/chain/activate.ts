// Builds the activation transaction for the connected wallet: a pubkey-validity proof, then
// vault::create_confidential_account (which creates the WUSDC token account, reallocates it for the
// confidential extension and registers the ElGamal key, all inside that one instruction).
import { address, unwrapOption, type Instruction, type TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, fetchMaybeMint } from "@solana-program/token-2022";
import { getCreateConfidentialAccountInstruction } from "@/generated/vault/src/generated";
import type { DerivedKeys } from "@/lib/crypto/keys";
import { DEVNET_WUSDC_MINT } from "./constants";
import { buildKeyRegistration } from "./key-registration";
import { ataFor } from "./read";
import type { AppRpc } from "./rpc";

const WUSDC = address(DEVNET_WUSDC_MINT);

export interface MintRequirements {
  /** When false, a newly configured account stays unapproved until the mint's authority approves it (decision D4). */
  autoApproveNewAccounts: boolean;
}

/** Fails early with a plain message if the mint can't hold confidential balances (wrong cluster, not bootstrapped). */
export async function readMintRequirements(rpc: AppRpc): Promise<MintRequirements> {
  const mint = await fetchMaybeMint(rpc, WUSDC, { commitment: "confirmed" });
  if (!mint.exists) throw new Error("The WUSDC mint wasn't found on this network. Check that the app points at devnet.");
  const ext = (unwrapOption(mint.data.extensions) ?? []).find((e) => e.__kind === "ConfidentialTransferMint");
  if (!ext || ext.__kind !== "ConfidentialTransferMint") throw new Error("The WUSDC mint doesn't have confidential transfers enabled.");
  return { autoApproveNewAccounts: ext.autoApproveNewAccounts };
}

/**
 * [VerifyPubkeyValidity, create_confidential_account]. The proof must be the instruction immediately before the
 * program's (offset -1 from the top-level instruction, regardless of the CPI depth Token-2022 runs at).
 */
export async function buildActivationInstructions(input: { rpc: AppRpc; signer: TransactionSigner; keys: DerivedKeys }): Promise<Instruction[]> {
  const { rpc, signer, keys } = input;
  const reg = await buildKeyRegistration({ rpc, signer, keys });
  const tokenAccount = await ataFor(signer.address, WUSDC, TOKEN_2022_PROGRAM_ADDRESS);
  const create = getCreateConfidentialAccountInstruction({
    owner: signer,
    mint: WUSDC,
    tokenAccount,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    elgamalPubkey: reg.elgamalPubkey,
    decryptableZeroBalance: reg.decryptableZeroBalance,
  });
  return [...reg.verify, create];
}
